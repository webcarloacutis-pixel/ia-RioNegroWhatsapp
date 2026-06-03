import { promises as fs } from "node:fs";
import path from "node:path";

import { DeliveryMode, DeliveryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { countPendingCitizenReports } from "@/server/citizen-report-service";
import { messageServiceInternals } from "@/server/messageService";

export type QaModuleStatus = "ok" | "warning" | "fail";

export type QaModuleMetric = {
  module: string;
  status: QaModuleStatus;
  successRate: number;
  errorRate: number;
  avgResponseMs: number;
  lastCheckedAt: string;
  details: string;
};

export type SimulationSummary = {
  total: number;
  success: number;
  failed: number;
  ignored: number;
  intentDetected: number;
  citizenReportsCreated: number;
  announcementsSimulated: number;
  responsesGenerated: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  generatedAt: string;
  dryRun: boolean;
  errorsByType?: Record<string, number>;
};

const ROUTES = [
  { path: "/api/health", method: "GET", module: "Health", auth: false },
  { path: "/api/debug/env", method: "GET", module: "Debug", auth: false },
  { path: "/api/debug/webhook", method: "GET", module: "Webhook", auth: false },
  { path: "/api/debug/routes", method: "GET", module: "Debug", auth: false },
  { path: "/api/debug/db", method: "GET", module: "Prisma DB", auth: false },
  { path: "/api/debug/ultramsg", method: "GET", module: "UltraMsg", auth: false },
  { path: "/api/debug/announcements", method: "GET", module: "Comunicados", auth: false },
  { path: "/api/debug/citizen-reports", method: "GET", module: "Denuncias", auth: false },
  { path: "/api/auth/login", method: "POST", module: "Auth", auth: false },
  { path: "/api/auth/session", method: "GET", module: "Auth", auth: false },
  { path: "/api/dashboard", method: "GET", module: "Dashboard", auth: true },
  { path: "/api/metrics", method: "GET", module: "Metricas", auth: true },
  { path: "/api/announcements", method: "GET/POST", module: "Comunicados", auth: true },
  { path: "/api/announcements/[id]", method: "PATCH/DELETE", module: "Comunicados", auth: true },
  { path: "/api/announcements/[id]/simulate", method: "POST", module: "Comunicados", auth: true },
  { path: "/api/announcements/[id]/send", method: "POST", module: "Comunicados", auth: true },
  { path: "/api/scheduler/run", method: "POST", module: "Scheduler", auth: true },
  { path: "/api/admin/citizen-reports", method: "GET", module: "Denuncias", auth: true },
  { path: "/api/assistant/chat", method: "POST", module: "Asistente IA", auth: true },
  { path: "/api/assistant/reset", method: "POST", module: "Asistente IA", auth: true },
  { path: "/api/qa-dashboard", method: "GET", module: "QA Dashboard", auth: true },
  { path: "/api/qa-dashboard/scenarios", method: "GET/POST", module: "QA Dashboard", auth: true },
  { path: "/api/qa-dashboard/scenarios/[id]", method: "PATCH/DELETE", module: "QA Dashboard", auth: true },
  { path: "/api/qa-dashboard/run", method: "POST", module: "QA Dashboard", auth: true },
  { path: "/api/qa-dashboard/export", method: "GET", module: "QA Dashboard", auth: true },
  { path: "/api/webhook", method: "GET/POST", module: "UltraMsg webhook", auth: false },
  { path: "/api/ultramsg/webhook", method: "GET/POST", module: "UltraMsg webhook", auth: false },
];

function nowIso() {
  return new Date().toISOString();
}

function exists(name: string) {
  return Boolean(process.env[name]?.trim());
}

function flagValue(name: string) {
  return process.env[name]?.trim() || "undefined";
}

function maskError(error: unknown) {
  if (!(error instanceof Error)) return "unknown_error";
  const message = error.message
    .replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***@")
    .replace(/[A-Z]:\\[^\n\r]+/g, "[local-path]")
    .replace(/\s+/g, " ")
    .trim();

  if (message.includes("Error validating datasource")) {
    return "Prisma datasource invalido: la URL/runtime no coincide con el cliente generado.";
  }

  if (message.includes("Can't reach database server")) {
    return "No se pudo conectar con la base de datos.";
  }

  if (message.includes("Authentication failed against database server")) {
    return "Fallo autenticacion contra la base de datos.";
  }

  if (message.includes("The table") || message.includes("does not exist")) {
    return "Faltan tablas o migraciones de Prisma.";
  }

  return message.slice(0, 240);
}

function metric(input: {
  module: string;
  status: QaModuleStatus;
  details: string;
  successRate?: number;
  errorRate?: number;
  avgResponseMs?: number;
}): QaModuleMetric {
  return {
    module: input.module,
    status: input.status,
    successRate: input.successRate ?? (input.status === "fail" ? 0 : 100),
    errorRate: input.errorRate ?? (input.status === "fail" ? 100 : 0),
    avgResponseMs: input.avgResponseMs ?? 0,
    lastCheckedAt: nowIso(),
    details: input.details,
  };
}

export function isSimulationMode() {
  return process.env.SIMULATION_MODE === "true" || process.env.WHATSAPP_DRY_RUN === "true";
}

export function getSafeEnvStatus() {
  return {
    ok: true,
    env: {
      NODE_ENV: flagValue("NODE_ENV"),
      DATABASE_URL: exists("DATABASE_URL"),
      DIRECT_URL: exists("DIRECT_URL"),
      ADMIN_EMAIL: exists("ADMIN_EMAIL"),
      ADMIN_PASSWORD: exists("ADMIN_PASSWORD"),
      OPENAI_API_KEY: exists("OPENAI_API_KEY"),
      OPENAI_MODEL: flagValue("OPENAI_MODEL"),
      OPENAI_TRANSCRIPTION_MODEL: flagValue("OPENAI_TRANSCRIPTION_MODEL"),
      ELEVENLABS_API_KEY: exists("ELEVENLABS_API_KEY"),
      ELEVENLABS_VOICE_ID: exists("ELEVENLABS_VOICE_ID"),
      ELEVENLABS_MODEL_ID: flagValue("ELEVENLABS_MODEL_ID"),
      ELEVENLABS_OUTPUT_FORMAT: flagValue("ELEVENLABS_OUTPUT_FORMAT"),
      ELEVENLABS_LANGUAGE_CODE: flagValue("ELEVENLABS_LANGUAGE_CODE"),
      ULTRAMSG_TOKEN: exists("ULTRAMSG_TOKEN"),
      ULTRAMSG_INSTANCE_ID: exists("ULTRAMSG_INSTANCE_ID"),
      ULTRAMSG_BASE_URL: exists("ULTRAMSG_BASE_URL"),
      ULTRAMSG_API_URL: exists("ULTRAMSG_API_URL"),
      ULTRAMSG_DEFAULT_TO: exists("ULTRAMSG_DEFAULT_TO"),
      WHATSAPP_SAFE_MODE: flagValue("WHATSAPP_SAFE_MODE"),
      WHATSAPP_AUDIO_REPLIES: flagValue("WHATSAPP_AUDIO_REPLIES"),
      WHATSAPP_SEND_TEXT_WITH_AUDIO: flagValue("WHATSAPP_SEND_TEXT_WITH_AUDIO"),
      WHATSAPP_LANGUAGE: flagValue("WHATSAPP_LANGUAGE"),
      WHATSAPP_DRY_RUN: flagValue("WHATSAPP_DRY_RUN"),
      SIMULATION_MODE: flagValue("SIMULATION_MODE"),
      OPENAI_MOCK: flagValue("OPENAI_MOCK"),
      ELEVENLABS_MOCK: flagValue("ELEVENLABS_MOCK"),
      ULTRAMSG_MOCK: flagValue("ULTRAMSG_MOCK"),
    },
  };
}

export function getRouteDiagnostics() {
  return {
    ok: true,
    routes: ROUTES,
    summary: {
      total: ROUTES.length,
      public: ROUTES.filter((route) => !route.auth).length,
      adminProtected: ROUTES.filter((route) => route.auth).length,
    },
  };
}

export async function getDbDiagnostics() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const [
      announcements,
      segments,
      deliveryLogs,
      citizenReports,
      assistantLogs,
      knowledgeEntries,
    ] = await Promise.all([
      prisma.announcement.count(),
      prisma.segment.count(),
      prisma.deliveryLog.count(),
      prisma.citizenReport.count(),
      prisma.assistantQueryLog.count(),
      prisma.knowledgeBaseEntry.count(),
    ]);

    return {
      ok: true,
      connected: true,
      responseMs: Date.now() - startedAt,
      models: {
        announcements: true,
        segments: true,
        deliveryLogs: true,
        citizenReports: true,
        conversations: true,
        knowledgeEntries: true,
      },
      counts: {
        announcements,
        segments,
        deliveryLogs,
        citizenReports,
        assistantLogs,
        knowledgeEntries,
      },
    };
  } catch (error) {
    return {
      ok: false,
      connected: false,
      responseMs: Date.now() - startedAt,
      models: {
        announcements: false,
        segments: false,
        deliveryLogs: false,
        citizenReports: false,
        conversations: false,
        knowledgeEntries: false,
      },
      error: maskError(error),
    };
  }
}

export function getUltraMsgDiagnostics() {
  let baseUrl: string | null = null;
  let baseUrlError: string | null = null;

  try {
    baseUrl = messageServiceInternals.getUltraMsgBaseUrl();
  } catch (error) {
    baseUrlError = maskError(error);
  }

  return {
    ok: messageServiceInternals.isWhatsAppDryRunMode() || Boolean(exists("ULTRAMSG_TOKEN") && baseUrl),
    configured: messageServiceInternals.isUltraMsgConfigured(),
    provider: "ultramsg",
    baseUrlConfigured: Boolean(baseUrl),
    baseUrlHost: baseUrl ? new URL(baseUrl).host : null,
    instanceIdConfigured: exists("ULTRAMSG_INSTANCE_ID"),
    tokenConfigured: exists("ULTRAMSG_TOKEN"),
    defaultRecipientConfigured: exists("ULTRAMSG_DEFAULT_TO"),
    safeMode: messageServiceInternals.isWhatsAppSafeMode(),
    dryRun: messageServiceInternals.isWhatsAppDryRunMode(),
    error: baseUrlError,
  };
}

export async function getAnnouncementsDiagnostics() {
  const startedAt = Date.now();

  try {
    const [
      scheduled,
      sent,
      simulated,
      blocked,
      failedAnnouncements,
      failedLogs,
      demoLogs,
      manualLogs,
      segmentsWithRecipients,
      due,
    ] =
      await Promise.all([
        prisma.announcement.count({ where: { status: "SCHEDULED" } }),
        prisma.announcement.count({ where: { status: { in: ["SENT", "SENT_REAL"] } } }),
        prisma.announcement.count({ where: { status: "SENT_SIMULATED" } }),
        prisma.announcement.count({ where: { status: "BLOCKED_BY_SAFE_MODE" } }),
        prisma.announcement.count({ where: { status: "FAILED" } }),
        prisma.deliveryLog.count({ where: { status: DeliveryStatus.FAILED } }),
        prisma.deliveryLog.count({ where: { mode: DeliveryMode.DEMO } }),
        prisma.deliveryLog.count({ where: { mode: DeliveryMode.MANUAL } }),
        prisma.segment.count({
          where: {
            recipientPhones: {
              isEmpty: false,
            },
          },
        }),
        prisma.announcement.count({
          where: {
            status: "SCHEDULED",
            scheduledAt: {
              lte: new Date(),
            },
          },
        }),
      ]);

    const hasRecipientSource = segmentsWithRecipients > 0 || exists("ULTRAMSG_DEFAULT_TO");
    const safeMode = messageServiceInternals.isWhatsAppSafeMode();

    return {
      ok: true,
      responseMs: Date.now() - startedAt,
      counts: {
        scheduled,
        sent,
        simulated,
        blocked,
        failedAnnouncements,
        due,
        failedLogs,
        demoLogs,
        manualLogs,
        segmentsWithRecipients,
      },
      sending: {
        safeMode,
        dryRun: isSimulationMode(),
        ultraMsgConfigured: messageServiceInternals.isUltraMsgConfigured(),
        hasRecipientSource,
        likelyRealSendingBlocked: safeMode || !hasRecipientSource,
      },
      notes: [
        safeMode ? "WHATSAPP_SAFE_MODE=true bloquea envios proactivos reales." : null,
        !hasRecipientSource ? "No hay ULTRAMSG_DEFAULT_TO ni segmentos con telefonos." : null,
      ].filter(Boolean),
    };
  } catch (error) {
    return {
      ok: false,
      responseMs: Date.now() - startedAt,
      error: maskError(error),
    };
  }
}

export async function getCitizenReportsDiagnostics() {
  const startedAt = Date.now();

  try {
    const [total, pending, urgent, withImages] = await Promise.all([
      prisma.citizenReport.count(),
      prisma.citizenReport.count({ where: { status: "pending" } }),
      prisma.citizenReport.count({ where: { priority: "urgent" } }),
      prisma.citizenReportImage.count(),
    ]);

    return {
      ok: true,
      responseMs: Date.now() - startedAt,
      counts: {
        total,
        pending,
        urgent,
        images: withImages,
      },
    };
  } catch (error) {
    return {
      ok: false,
      responseMs: Date.now() - startedAt,
      error: maskError(error),
    };
  }
}

export async function getLatestSimulationResult(): Promise<SimulationSummary | null> {
  const filePath = path.join(process.cwd(), "simulation-results", "latest.json");

  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as SimulationSummary;
  } catch {
    return null;
  }
}

export async function buildQaSnapshot() {
  const [db, ultramsg, announcements, citizenReports, simulation] = await Promise.all([
    getDbDiagnostics(),
    Promise.resolve(getUltraMsgDiagnostics()),
    getAnnouncementsDiagnostics(),
    getCitizenReportsDiagnostics(),
    getLatestSimulationResult(),
  ]);

  const openAiMock = process.env.OPENAI_MOCK === "true" || process.env.SIMULATION_MODE === "true";
  const elevenLabsMock =
    process.env.ELEVENLABS_MOCK === "true" || process.env.SIMULATION_MODE === "true";
  const openAiConfigured = exists("OPENAI_API_KEY") || openAiMock;
  const elevenLabsConfigured =
    (exists("ELEVENLABS_API_KEY") && exists("ELEVENLABS_VOICE_ID")) || elevenLabsMock;
  const pendingReports = citizenReports.ok && "counts" in citizenReports
    ? citizenReports.counts?.pending ?? 0
    : await countPendingCitizenReports().catch(() => 0);
  const announcementsBlocked =
    announcements.ok && "sending" in announcements
      ? announcements.sending?.likelyRealSendingBlocked ?? false
      : false;
  const announcementsDetails =
    announcements.ok && "sending" in announcements
      ? announcementsBlocked
        ? "Envio real probablemente bloqueado por safe mode o falta de destinatarios."
        : "Modulo operativo."
      : "error" in announcements
        ? announcements.error ?? "No se pudo diagnosticar comunicados."
        : "No se pudo diagnosticar comunicados.";
  const citizenReportDetails =
    citizenReports.ok && "counts" in citizenReports
      ? `${pendingReports} reporte(s) pendiente(s).`
      : "error" in citizenReports
        ? citizenReports.error ?? "No se pudo diagnosticar denuncias."
        : "No se pudo diagnosticar denuncias.";

  const modules: QaModuleMetric[] = [
    metric({
      module: "Auth",
      status: exists("ADMIN_EMAIL") && exists("ADMIN_PASSWORD") ? "ok" : "warning",
      details: "Login por cookie httpOnly; no depende de Prisma.",
    }),
    metric({
      module: "Dashboard",
      status: db.ok ? "ok" : "warning",
      details: db.ok ? "Datos con Prisma disponible." : "Debe mostrar fallback si Prisma falla.",
      avgResponseMs: db.responseMs,
    }),
    metric({
      module: "Comunicados",
      status: announcements.ok
        ? announcementsBlocked
          ? "warning"
          : "ok"
        : "fail",
      details: announcementsDetails,
      avgResponseMs: announcements.responseMs,
    }),
    metric({
      module: "Envio WhatsApp",
      status: ultramsg.ok ? (ultramsg.safeMode ? "warning" : "ok") : "fail",
      details: ultramsg.ok
        ? ultramsg.safeMode
          ? "UltraMsg configurado, pero safe mode bloquea envios proactivos reales."
          : "UltraMsg configurado para envios."
        : ultramsg.error ?? "Falta configuracion UltraMsg.",
    }),
    metric({
      module: "UltraMsg webhook",
      status: "ok",
      details: "Webhook publico activo en /api/webhook y /api/ultramsg/webhook.",
    }),
    metric({
      module: "Denuncias ciudadanas",
      status: citizenReports.ok ? (pendingReports > 0 ? "warning" : "ok") : "fail",
      details: citizenReportDetails,
      avgResponseMs: citizenReports.responseMs,
    }),
    metric({
      module: "Conversaciones",
      status: db.ok ? "ok" : "warning",
      details: "Depende de AssistantQueryLog con fallback en memoria.",
    }),
    metric({
      module: "Asistente IA",
      status: openAiConfigured ? "ok" : "warning",
      details: openAiMock
        ? "OpenAI en modo mock seguro."
        : openAiConfigured
          ? "OpenAI configurado."
          : "Sin OPENAI_API_KEY; usar fallback.",
    }),
    metric({
      module: "Prisma DB",
      status: db.ok ? "ok" : "fail",
      details: db.ok ? "Conexion y modelos principales OK." : db.error ?? "DB no disponible.",
      avgResponseMs: db.responseMs,
    }),
    metric({
      module: "OpenAI",
      status: openAiConfigured ? "ok" : "warning",
      details: openAiMock
        ? "OPENAI_MOCK/SIMULATION_MODE activo; no se consumen creditos."
        : openAiConfigured
          ? "API key presente."
          : "API key ausente.",
    }),
    metric({
      module: "ElevenLabs",
      status: elevenLabsConfigured ? "ok" : "warning",
      details: elevenLabsMock
        ? "ELEVENLABS_MOCK/SIMULATION_MODE activo; no se genera audio real."
        : elevenLabsConfigured
          ? "API key y voice id presentes."
          : "Falta API key o voice id.",
    }),
    metric({
      module: "Render runtime",
      status: "ok",
      details: `NODE_ENV=${flagValue("NODE_ENV")}; dryRun=${isSimulationMode()}`,
    }),
  ];

  const okCount = modules.filter((item) => item.status === "ok").length;
  const warningCount = modules.filter((item) => item.status === "warning").length;
  const failCount = modules.filter((item) => item.status === "fail").length;
  const successRate = Math.round((okCount / modules.length) * 1000) / 10;
  const errorRate = Math.round((failCount / modules.length) * 1000) / 10;

  return {
    ok: failCount === 0,
    generatedAt: nowIso(),
    summary: {
      totalModules: modules.length,
      ok: okCount,
      warning: warningCount,
      fail: failCount,
      successRate,
      errorRate,
    },
    modules,
    diagnostics: {
      db,
      ultramsg,
      announcements,
      citizenReports,
    },
    simulation,
  };
}

export const qaInternals = {
  maskError,
  metric,
};
