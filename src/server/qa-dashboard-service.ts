import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";

import { AppError } from "@/lib/errors";
import type {
  QaCategoryMetric,
  QaDashboardData,
  QaHallucinationFinding,
  QaRunRecord,
  QaRunSummary,
  QaScenario,
  QaScenarioResult,
  QaTestStatus,
} from "@/lib/types";
import type { qaScenarioInputSchema, qaScenarioPatchSchema } from "@/lib/validations";
import { chatWithAssistant, resetConversation } from "@/server/rionegro-assistant";

type QaScenarioInput = z.infer<typeof qaScenarioInputSchema>;
type QaScenarioPatch = z.infer<typeof qaScenarioPatchSchema>;

type QaRunInput = {
  scenarioIds?: string[];
  includeInactive?: boolean;
  evaluatorMode?: "rules" | "gpt";
};

type CsvCell = string | number | boolean | null | undefined;

const QA_DIR = path.join(process.cwd(), "qa");
const SCENARIOS_FILE = path.join(QA_DIR, "qa-dashboard-scenarios.json");
const HISTORY_FILE = path.join(QA_DIR, "qa-dashboard-history.json");
const MAX_HISTORY_RUNS = 50;

const DEFAULT_CATEGORY_ORDER = [
  "Informacion municipal",
  "Tramites",
  "Atencion ciudadana",
  "Horarios",
  "Dependencias",
  "Seguridad",
  "Casos ambiguos",
  "Casos extremos",
  "Integraciones",
  "Memoria",
  "Contexto",
  "Bilingue",
  "Alucinaciones",
  "Prompt Injection",
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesText(haystack: string, needle: string) {
  return normalizeText(haystack).includes(normalizeText(needle));
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sortScenarios(scenarios: QaScenario[]) {
  return [...scenarios].sort((a, b) => {
    const categoryDiff =
      DEFAULT_CATEGORY_ORDER.indexOf(a.category) - DEFAULT_CATEGORY_ORDER.indexOf(b.category);

    if (categoryDiff !== 0) return categoryDiff;
    return a.title.localeCompare(b.title, "es");
  });
}

function makeScenario(input: QaScenarioInput): QaScenario {
  const createdAt = nowIso();

  return {
    id: `qa-${randomUUID()}`,
    ...input,
    description: input.description ?? "",
    expectedKeywords: input.expectedKeywords ?? [],
    forbiddenKeywords: input.forbiddenKeywords ?? [],
    active: input.active ?? true,
    createdAt,
    updatedAt: createdAt,
  };
}

function countHallucinations(finding: QaHallucinationFinding) {
  return (
    finding.inventedLinks.length +
    finding.inventedPhones.length +
    finding.inventedAddresses.length +
    finding.inventedHours.length
  );
}

function uniqueMatches(matches: string[]) {
  return Array.from(new Set(matches.filter(Boolean)));
}

function detectHallucinations(input: {
  scenario: QaScenario;
  reply: string;
}): QaHallucinationFinding {
  const reply = input.reply;
  const expectedText = normalizeText(
    [
      input.scenario.expectedBehavior,
      input.scenario.expectedKeywords.join(" "),
      input.scenario.input,
    ].join(" "),
  );
  const links = uniqueMatches(reply.match(/https?:\/\/[^\s)]+/gi) ?? []);
  const inventedLinks = links.filter((link) => {
    try {
      const host = new URL(link).hostname.toLowerCase();
      return !host.endsWith("rionegro.gov.co") && !host.endsWith("gov.co");
    } catch {
      return true;
    }
  });

  const phones = uniqueMatches(
    reply.match(/(?:\+?57\s?)?(?:3\d{2}|60[0-9]?|4)\s?\d{3}\s?\d{4}/g) ?? [],
  );
  const inventedPhones = expectedText.includes("telefono") ? [] : phones;

  const addressMatches = uniqueMatches(
    reply.match(/\b(?:calle|carrera|cra\.?|cl\.?|diagonal|transversal)\s+\d+[a-z0-9#\-\s]*/gi) ??
      [],
  );
  const inventedAddresses =
    expectedText.includes("direccion") || expectedText.includes("ubicacion") ? [] : addressMatches;

  const hourMatches = uniqueMatches(
    reply.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:a\.?\s?m\.?|p\.?\s?m\.?)?\b/gi) ?? [],
  ).filter((match) => /\d/.test(match) && /(:|a|p)/i.test(match));
  const inventedHours = expectedText.includes("horario") ? [] : hourMatches;

  return {
    inventedLinks,
    inventedPhones,
    inventedAddresses,
    inventedHours,
  };
}

export function evaluateQaScenarioResult(input: {
  scenario: QaScenario;
  reply: string;
  responseTimeMs: number;
  runId?: string;
  createdAt?: string;
}): QaScenarioResult {
  const runId = input.runId ?? `qa-run-${randomUUID()}`;
  const createdAt = input.createdAt ?? nowIso();
  const expectedKeywords = input.scenario.expectedKeywords ?? [];
  const forbiddenKeywords = input.scenario.forbiddenKeywords ?? [];
  const matchedKeywords = expectedKeywords.filter((keyword) => includesText(input.reply, keyword));
  const missingKeywords = expectedKeywords.filter((keyword) => !includesText(input.reply, keyword));
  const detectedForbiddenKeywords = forbiddenKeywords.filter((keyword) =>
    includesText(input.reply, keyword),
  );
  const hallucinations = detectHallucinations({
    scenario: input.scenario,
    reply: input.reply,
  });
  const hallucinationCount = countHallucinations(hallucinations);
  const differences: string[] = [];

  if (missingKeywords.length) {
    differences.push(`Faltan palabras esperadas: ${missingKeywords.join(", ")}.`);
  }

  if (detectedForbiddenKeywords.length) {
    differences.push(`Incluye palabras prohibidas: ${detectedForbiddenKeywords.join(", ")}.`);
  }

  if (hallucinationCount > 0) {
    differences.push("Posible alucinacion detectada en enlaces, telefonos, direcciones u horarios.");
  }

  if (!input.reply.trim()) {
    differences.push("El bot no devolvio respuesta.");
  }

  const keywordScore = expectedKeywords.length
    ? Math.round((matchedKeywords.length / expectedKeywords.length) * 45)
    : 35;
  const forbiddenScore = detectedForbiddenKeywords.length ? 0 : 30;
  const hallucinationScore = hallucinationCount ? 0 : 10;
  const answerScore = input.reply.trim().length > 8 ? 15 : 0;
  const score = Math.max(0, Math.min(100, keywordScore + forbiddenScore + hallucinationScore + answerScore));
  const hasCriticalFailure = Boolean(
    detectedForbiddenKeywords.length || !input.reply.trim() || missingKeywords.length,
  );
  const status: QaTestStatus = hasCriticalFailure
    ? "FAIL"
    : hallucinationCount > 0 || score < 85
      ? "WARNING"
      : "PASS";
  const failureReason =
    status === "PASS" ? null : differences[0] ?? "La respuesta no cumplio completamente el escenario.";

  return {
    id: `qa-result-${randomUUID()}`,
    scenarioId: input.scenario.id,
    runId,
    caseTitle: input.scenario.title,
    category: input.scenario.category,
    status,
    score,
    responseTimeMs: input.responseTimeMs,
    input: input.scenario.input,
    botReply: input.reply,
    expectedBehavior: input.scenario.expectedBehavior,
    expectedKeywords,
    forbiddenKeywords,
    matchedKeywords,
    missingKeywords,
    detectedForbiddenKeywords,
    hallucinations,
    differences,
    failureReason,
    createdAt,
    wasRegression: false,
  };
}

function emptySummary(): QaRunSummary {
  return {
    runId: "qa-run-empty",
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    passRate: 0,
    confidenceScore: 0,
    averageResponseTimeMs: 0,
    lastRun: null,
    hallucinationCount: 0,
    regressionCount: 0,
  };
}

export function summarizeQaRun(input: {
  runId: string;
  createdAt: string;
  results: QaScenarioResult[];
}): QaRunSummary {
  const totalTests = input.results.length;
  const passed = input.results.filter((item) => item.status === "PASS").length;
  const failed = input.results.filter((item) => item.status === "FAIL").length;
  const warnings = input.results.filter((item) => item.status === "WARNING").length;
  const scoreTotal = input.results.reduce((total, item) => total + item.score, 0);
  const timeTotal = input.results.reduce((total, item) => total + item.responseTimeMs, 0);
  const hallucinationCount = input.results.reduce(
    (total, item) => total + countHallucinations(item.hallucinations),
    0,
  );
  const regressionCount = input.results.filter((item) => item.wasRegression).length;

  return {
    runId: input.runId,
    totalTests,
    passed,
    failed,
    warnings,
    passRate: totalTests ? Math.round((passed / totalTests) * 1000) / 10 : 0,
    confidenceScore: totalTests ? Math.round((scoreTotal / totalTests) * 10) / 10 : 0,
    averageResponseTimeMs: totalTests ? Math.round(timeTotal / totalTests) : 0,
    lastRun: input.createdAt,
    hallucinationCount,
    regressionCount,
  };
}

export function buildQaCategoryMetrics(
  scenarios: QaScenario[],
  results: QaScenarioResult[],
): QaCategoryMetric[] {
  const categories = Array.from(
    new Set([
      ...DEFAULT_CATEGORY_ORDER,
      ...scenarios.map((item) => item.category),
      ...results.map((item) => item.category),
    ]),
  );

  return categories
    .map((category) => {
      const categoryResults = results.filter((item) => item.category === category);
      const scenarioTotal = scenarios.filter((item) => item.category === category).length;
      const total = categoryResults.length || scenarioTotal;
      const pass = categoryResults.filter((item) => item.status === "PASS").length;
      const fail = categoryResults.filter((item) => item.status === "FAIL").length;
      const warning = categoryResults.filter((item) => item.status === "WARNING").length;

      return {
        category,
        total,
        pass,
        fail,
        warning,
        percentage: categoryResults.length ? Math.round((pass / categoryResults.length) * 1000) / 10 : 0,
      };
    })
    .filter((item) => item.total > 0);
}

export function detectQaRegressions(input: {
  currentResults: QaScenarioResult[];
  previousRun?: QaRunRecord | null;
}) {
  const previousByScenario = new Map(
    (input.previousRun?.results ?? []).map((item) => [item.scenarioId, item]),
  );

  return input.currentResults.map((result) => {
    const previous = previousByScenario.get(result.scenarioId);
    return {
      ...result,
      wasRegression: previous?.status === "PASS" && result.status === "FAIL",
    };
  });
}

function buildHallucinationSummary(results: QaScenarioResult[]) {
  const totals = results.reduce(
    (accumulator, item) => {
      accumulator.links += item.hallucinations.inventedLinks.length;
      accumulator.phones += item.hallucinations.inventedPhones.length;
      accumulator.addresses += item.hallucinations.inventedAddresses.length;
      accumulator.hours += item.hallucinations.inventedHours.length;
      return accumulator;
    },
    { links: 0, phones: 0, addresses: 0, hours: 0 },
  );

  return {
    total: totals.links + totals.phones + totals.addresses + totals.hours,
    ...totals,
  };
}

function buildCharts(history: QaRunRecord[], categoryMetrics: QaCategoryMetric[]): QaDashboardData["charts"] {
  const orderedHistory = [...history].reverse().slice(-12);
  const latest = history[0];
  const latestResults = latest?.results ?? [];
  const errorCounts = [
    {
      label: "Keywords faltantes",
      value: latestResults.filter((item) => item.missingKeywords.length > 0).length,
    },
    {
      label: "Palabras prohibidas",
      value: latestResults.filter((item) => item.detectedForbiddenKeywords.length > 0).length,
    },
    {
      label: "Alucinaciones",
      value: latestResults.filter((item) => countHallucinations(item.hallucinations) > 0).length,
    },
    {
      label: "Regresiones",
      value: latestResults.filter((item) => item.wasRegression).length,
    },
  ];

  return {
    passRateByCategory: categoryMetrics.map((item) => ({
      label: item.category,
      value: item.percentage,
      pass: item.pass,
      fail: item.fail,
      warning: item.warning,
    })),
    historicalEvolution: orderedHistory.map((run, index) => ({
      label: `Run ${index + 1}`,
      value: run.summary.passRate,
      pass: run.summary.passed,
      fail: run.summary.failed,
      warning: run.summary.warnings,
    })),
    responseTimeTrend: orderedHistory.map((run, index) => ({
      label: `Run ${index + 1}`,
      value: run.summary.averageResponseTimeMs,
      responseMs: run.summary.averageResponseTimeMs,
    })),
    errorDistribution: errorCounts,
    weeklyTrend: orderedHistory.map((run) => ({
      label: new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(new Date(run.createdAt)),
      value: run.summary.passRate,
    })),
  };
}

async function runScenario(scenario: QaScenario, runId: string, createdAt: string) {
  const sessionId = `qa-dashboard-${runId}-${scenario.id}`;
  const startedAt = Date.now();
  const messages = scenario.input
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const steps = messages.length ? messages : [scenario.input];
  let reply = "";

  resetConversation(sessionId);

  try {
    for (const message of steps) {
      const result = await chatWithAssistant(sessionId, message);
      reply = result.reply;
    }
  } catch (error) {
    reply = `QA execution error: ${error instanceof Error ? error.message : "unknown_error"}`;
  }

  return evaluateQaScenarioResult({
    scenario,
    reply,
    responseTimeMs: Date.now() - startedAt,
    runId,
    createdAt,
  });
}

export async function listQaScenarios() {
  const scenarios = await readJsonFile<QaScenario[]>(SCENARIOS_FILE, []);
  return sortScenarios(scenarios);
}

export async function saveQaScenarios(scenarios: QaScenario[]) {
  await writeJsonFile(SCENARIOS_FILE, sortScenarios(scenarios));
}

export async function createQaScenario(input: QaScenarioInput) {
  const scenarios = await listQaScenarios();
  const scenario = makeScenario(input);
  await saveQaScenarios([...scenarios, scenario]);
  return scenario;
}

export async function updateQaScenario(id: string, patch: QaScenarioPatch) {
  const scenarios = await listQaScenarios();
  const index = scenarios.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new AppError("Escenario QA no encontrado.", 404);
  }

  const updated: QaScenario = {
    ...scenarios[index],
    ...patch,
    description: patch.description ?? scenarios[index].description,
    expectedKeywords: patch.expectedKeywords ?? scenarios[index].expectedKeywords,
    forbiddenKeywords: patch.forbiddenKeywords ?? scenarios[index].forbiddenKeywords,
    active: patch.active ?? scenarios[index].active,
    updatedAt: nowIso(),
  };

  const next = [...scenarios];
  next[index] = updated;
  await saveQaScenarios(next);
  return updated;
}

export async function duplicateQaScenario(id: string) {
  const scenarios = await listQaScenarios();
  const original = scenarios.find((item) => item.id === id);

  if (!original) {
    throw new AppError("Escenario QA no encontrado.", 404);
  }

  const createdAt = nowIso();
  const duplicate: QaScenario = {
    ...original,
    id: `qa-${randomUUID()}`,
    title: `${original.title} copia`,
    active: false,
    createdAt,
    updatedAt: createdAt,
  };

  await saveQaScenarios([...scenarios, duplicate]);
  return duplicate;
}

export async function deleteQaScenario(id: string) {
  const scenarios = await listQaScenarios();
  const next = scenarios.filter((item) => item.id !== id);

  if (next.length === scenarios.length) {
    throw new AppError("Escenario QA no encontrado.", 404);
  }

  await saveQaScenarios(next);
  return { deleted: true };
}

export async function listQaHistory() {
  const history = await readJsonFile<QaRunRecord[]>(HISTORY_FILE, []);
  return [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function runQaScenarios(input: QaRunInput = {}) {
  const startedAt = Date.now();
  const runId = `qa-run-${randomUUID()}`;
  const createdAt = nowIso();
  const scenarios = await listQaScenarios();
  const previousHistory = await listQaHistory();
  const selectedIds = new Set(input.scenarioIds ?? []);
  const selectedScenarios = scenarios.filter((scenario) => {
    const selected = selectedIds.size === 0 || selectedIds.has(scenario.id);
    const active = input.includeInactive || scenario.active;
    return selected && active;
  });
  const rawResults: QaScenarioResult[] = [];

  for (const scenario of selectedScenarios) {
    rawResults.push(await runScenario(scenario, runId, createdAt));
  }

  const results = detectQaRegressions({
    currentResults: rawResults,
    previousRun: previousHistory[0] ?? null,
  });
  const categoryMetrics = buildQaCategoryMetrics(scenarios, results);
  const summary = summarizeQaRun({ runId, createdAt, results });
  const record: QaRunRecord = {
    id: runId,
    createdAt,
    durationMs: Date.now() - startedAt,
    summary,
    categoryMetrics,
    results,
  };

  await writeJsonFile(HISTORY_FILE, [record, ...previousHistory].slice(0, MAX_HISTORY_RUNS));

  return {
    ...record,
    evaluatorMode: input.evaluatorMode ?? "rules",
  };
}

export async function buildQaDashboardData(): Promise<QaDashboardData> {
  const [scenarios, history] = await Promise.all([listQaScenarios(), listQaHistory()]);
  const latest = history[0] ?? null;
  const latestResults = latest?.results ?? [];
  const summary = latest?.summary ?? emptySummary();
  const categoryMetrics = latest?.categoryMetrics ?? buildQaCategoryMetrics(scenarios, []);
  const regressions = latestResults.filter((item) => item.wasRegression);
  const hallucinations = buildHallucinationSummary(latestResults);

  return {
    scenarios,
    summary,
    categoryMetrics,
    latestResults,
    history,
    regressions,
    hallucinations,
    charts: buildCharts(history, categoryMetrics),
  };
}

function csvEscape(value: CsvCell) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildQaExportCsv(data: QaDashboardData) {
  const rows = [
    [
      "Caso",
      "Categoria",
      "Estado",
      "Tiempo ms",
      "Score",
      "Fecha",
      "Regression",
      "Motivo",
    ],
    ...data.latestResults.map((item) => [
      item.caseTitle,
      item.category,
      item.status,
      item.responseTimeMs,
      item.score,
      item.createdAt,
      item.wasRegression,
      item.failureReason ?? "",
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildQaExportPdf(data: QaDashboardData) {
  const lines = [
    "QA Dashboard - Alcaldia de Rionegro",
    `Pass rate: ${data.summary.passRate}%`,
    `Confidence score: ${data.summary.confidenceScore}`,
    `Total tests: ${data.summary.totalTests}`,
    `Passed: ${data.summary.passed}`,
    `Failed: ${data.summary.failed}`,
    `Warnings: ${data.summary.warnings}`,
    `Regressions: ${data.summary.regressionCount}`,
    `Hallucinations: ${data.summary.hallucinationCount}`,
    "",
    ...data.latestResults.slice(0, 22).map((item) => `${item.status} ${item.score} - ${item.caseTitle}`),
  ];
  const textCommands = lines
    .map((line, index) => {
      const command = index === 0 ? "40 770 Td" : "0 -22 Td";
      return `${command} (${pdfEscape(line.slice(0, 94))}) Tj`;
    })
    .join("\n");
  const stream = `BT\n/F1 12 Tf\n${textCommands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export const qaDashboardInternals = {
  countHallucinations,
  detectHallucinations,
  normalizeText,
};
