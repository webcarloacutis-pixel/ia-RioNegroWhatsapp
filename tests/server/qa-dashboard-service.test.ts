import assert from "node:assert/strict";
import test from "node:test";

import type { QaDashboardData, QaRunRecord, QaScenario } from "@/lib/types";
import {
  buildQaExportCsv,
  detectQaRegressions,
  evaluateQaScenarioResult,
  summarizeQaRun,
} from "@/server/qa-dashboard-service";

const baseScenario: QaScenario = {
  id: "qa-test",
  category: "Tramites",
  title: "Predial",
  description: "Caso de predial",
  input: "Como pago el impuesto predial?",
  expectedBehavior: "Debe mencionar predial y no inventar enlaces.",
  expectedKeywords: ["predial"],
  forbiddenKeywords: ["link inventado"],
  active: true,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
};

test("evaluateQaScenarioResult marca PASS cuando cumple palabras y no viola reglas", () => {
  const result = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Para el impuesto predial, puedo orientarte con informacion oficial disponible.",
    responseTimeMs: 120,
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.score, 100);
  assert.deepEqual(result.matchedKeywords, ["predial"]);
  assert.deepEqual(result.detectedForbiddenKeywords, []);
});

test("evaluateQaScenarioResult marca FAIL por keyword faltante o prohibida", () => {
  const result = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Te dejo un link inventado para pagar.",
    responseTimeMs: 80,
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.missingKeywords, ["predial"]);
  assert.deepEqual(result.detectedForbiddenKeywords, ["link inventado"]);
  assert.match(result.failureReason ?? "", /Faltan palabras esperadas/);
});

test("evaluateQaScenarioResult detecta alucinaciones de link externo y telefono no esperado", () => {
  const result = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Paga predial en https://fake-rionegro.example con el telefono 3001234567.",
    responseTimeMs: 90,
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
  });

  assert.equal(result.status, "WARNING");
  assert.deepEqual(result.hallucinations.inventedLinks, ["https://fake-rionegro.example"]);
  assert.deepEqual(result.hallucinations.inventedPhones, ["3001234567"]);
});

test("detectQaRegressions marca caso que cambio de PASS a FAIL", () => {
  const previous = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Respuesta sobre predial.",
    responseTimeMs: 100,
    runId: "run-old",
    createdAt: "2026-06-02T00:00:00.000Z",
  });
  const current = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Respuesta sin la palabra esperada.",
    responseTimeMs: 100,
    runId: "run-new",
    createdAt: "2026-06-03T00:00:00.000Z",
  });
  const previousRun: QaRunRecord = {
    id: "run-old",
    createdAt: "2026-06-02T00:00:00.000Z",
    durationMs: 100,
    summary: summarizeQaRun({
      runId: "run-old",
      createdAt: "2026-06-02T00:00:00.000Z",
      results: [previous],
    }),
    categoryMetrics: [],
    results: [previous],
  };

  const [withRegression] = detectQaRegressions({
    currentResults: [current],
    previousRun,
  });

  assert.equal(withRegression.wasRegression, true);
});

test("summarizeQaRun calcula pass rate, score y tiempos", () => {
  const pass = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Respuesta sobre predial.",
    responseTimeMs: 100,
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
  });
  const fail = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Sin keyword.",
    responseTimeMs: 300,
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
  });
  const summary = summarizeQaRun({
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
    results: [pass, fail],
  });

  assert.equal(summary.totalTests, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.passRate, 50);
  assert.equal(summary.averageResponseTimeMs, 200);
});

test("buildQaExportCsv genera tabla descargable con resultados", () => {
  const result = evaluateQaScenarioResult({
    scenario: baseScenario,
    reply: "Respuesta sobre predial.",
    responseTimeMs: 100,
    runId: "run-1",
    createdAt: "2026-06-03T00:00:00.000Z",
  });
  const data: QaDashboardData = {
    scenarios: [baseScenario],
    summary: summarizeQaRun({
      runId: "run-1",
      createdAt: "2026-06-03T00:00:00.000Z",
      results: [result],
    }),
    categoryMetrics: [],
    latestResults: [result],
    history: [],
    regressions: [],
    hallucinations: {
      total: 0,
      links: 0,
      phones: 0,
      addresses: 0,
      hours: 0,
    },
    charts: {
      passRateByCategory: [],
      historicalEvolution: [],
      responseTimeTrend: [],
      errorDistribution: [],
      weeklyTrend: [],
    },
  };

  const csv = buildQaExportCsv(data);

  assert.match(csv, /Caso,Categoria,Estado/);
  assert.match(csv, /Predial,Tramites,PASS/);
});
