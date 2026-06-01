import test from "node:test";
import assert from "node:assert/strict";

import { assistantAnalyticsInternals } from "@/server/assistant-analytics-service";

const buildLog = (overrides: Partial<{
  id: string;
  sessionId: string;
  userMessage: string;
  assistantReply: string;
  topic: "INSTITUTIONAL" | "NEWS" | "UNKNOWN";
  route: "KNOWLEDGE_BASE" | "ANNOUNCEMENTS" | "HYBRID_AI";
  usedOpenAI: boolean;
  createdAt: Date;
}> = {}) => ({
  id: overrides.id ?? "log-1",
  sessionId: overrides.sessionId ?? "ultramsg:+573100000001",
  userMessage: overrides.userMessage ?? "Donde queda la alcaldia?",
  assistantReply: overrides.assistantReply ?? "La alcaldia queda en Carrera 50 # 49 - 05.",
  topic: overrides.topic ?? "INSTITUTIONAL",
  route: overrides.route ?? "KNOWLEDGE_BASE",
  usedOpenAI: overrides.usedOpenAI ?? false,
  profile: {
    zone: null,
    userType: null,
  },
  createdAt: overrides.createdAt ?? new Date(),
});

test("buildAnalyticsSummary calcula topicos, preguntas y recientes", () => {
  const now = new Date();
  const summary = assistantAnalyticsInternals.buildAnalyticsSummary([
    buildLog({ id: "1", userMessage: "Donde queda la alcaldia?", createdAt: now }),
    buildLog({ id: "2", userMessage: "Donde queda la alcaldia?", createdAt: now }),
    buildLog({
      id: "3",
      topic: "NEWS",
      route: "ANNOUNCEMENTS",
      userMessage: "Cuales son las noticias?",
      createdAt: now,
    }),
  ]);

  assert.equal(summary.totals.totalQueries, 3);
  assert.equal(summary.totals.topTopic, "Informacion institucional");
  assert.equal(summary.totals.topQuestion, "Donde queda la alcaldia?");
  assert.equal(summary.recentQueries.length, 3);
});

test("buildConversationThreads agrupa por sesion y reconoce WhatsApp", () => {
  const threads = assistantAnalyticsInternals.buildConversationThreads([
    buildLog({
      id: "1",
      sessionId: "ultramsg:+573100000001",
      userMessage: "Hola",
      createdAt: new Date("2026-04-20T10:00:00.000Z"),
    }),
    buildLog({
      id: "2",
      sessionId: "ultramsg:+573100000001",
      userMessage: "Donde queda movilidad?",
      assistantReply: "Movilidad queda en Carrera 48 # 47-19.",
      createdAt: new Date("2026-04-20T10:05:00.000Z"),
    }),
    buildLog({
      id: "3",
      sessionId: "panel-demo-session",
      userMessage: "Que puedo hacer hoy?",
      topic: "UNKNOWN",
      route: "HYBRID_AI",
      usedOpenAI: true,
      createdAt: new Date("2026-04-20T09:00:00.000Z"),
    }),
  ]);

  assert.equal(threads.length, 2);
  assert.equal(threads[0]?.sessionId, "ultramsg:+573100000001");
  assert.equal(threads[0]?.channel, "WHATSAPP");
  assert.equal(threads[0]?.exchangeCount, 2);
  assert.equal(threads[1]?.channel, "PANEL");
});

test("isDatabaseUnavailable reconoce errores de conexion conocidos", () => {
  assert.equal(
    assistantAnalyticsInternals.isDatabaseUnavailable(
      new Error("Authentication failed against database server"),
    ),
    true,
  );
  assert.equal(
    assistantAnalyticsInternals.isDatabaseUnavailable(new Error("Otro error cualquiera")),
    false,
  );
});
