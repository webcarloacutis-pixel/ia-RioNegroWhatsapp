import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssistantMemorySummary,
  extractPhoneNumberFromAssistantSessionId,
  getAssistantMemoryTimeoutAction,
  getConversationClosingReply,
  isConversationClosingMessage,
} from "@/server/assistant-memory-service";
import type { AssistantTurn } from "@/server/assistant-session";

test("extractPhoneNumberFromAssistantSessionId obtiene numero de WhatsApp", () => {
  assert.equal(
    extractPhoneNumberFromAssistantSessionId("whatsapp:+573108853158"),
    "+573108853158",
  );
  assert.equal(
    extractPhoneNumberFromAssistantSessionId("ultramsg:573108853158@c.us"),
    "+573108853158",
  );
  assert.equal(extractPhoneNumberFromAssistantSessionId("panel-demo-session"), null);
});

test("isConversationClosingMessage cierra solo frases exactas", () => {
  assert.equal(isConversationClosingMessage("gracias"), true);
  assert.equal(isConversationClosingMessage("No gracias"), true);
  assert.equal(isConversationClosingMessage("bye"), true);
  assert.equal(isConversationClosingMessage("gracias, y el horario?"), false);
});

test("getConversationClosingReply conserva idioma", () => {
  assert.match(getConversationClosingReply("es"), /Cierro esta conversación/i);
  assert.match(getConversationClosingReply("en"), /close this conversation/i);
});

test("getAssistantMemoryTimeoutAction pregunta a los 30 minutos y cierra 60 despues", () => {
  const now = new Date("2026-06-11T12:00:00.000Z");

  assert.equal(
    getAssistantMemoryTimeoutAction(
      {
        status: "open",
        lastAssistantMessageAt: new Date("2026-06-11T11:31:00.000Z"),
        followUpPromptedAt: null,
      },
      now,
    ),
    "none",
  );
  assert.equal(
    getAssistantMemoryTimeoutAction(
      {
        status: "open",
        lastAssistantMessageAt: new Date("2026-06-11T11:29:00.000Z"),
        followUpPromptedAt: null,
      },
      now,
    ),
    "prompt",
  );
  assert.equal(
    getAssistantMemoryTimeoutAction(
      {
        status: "open",
        lastAssistantMessageAt: new Date("2026-06-11T10:00:00.000Z"),
        followUpPromptedAt: new Date("2026-06-11T10:59:00.000Z"),
      },
      now,
    ),
    "close",
  );
});

test("buildAssistantMemorySummary mantiene resumen menor a 1000 caracteres", () => {
  const history: AssistantTurn[] = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `mensaje largo ${index} ${"x".repeat(220)}`,
    createdAt: new Date(2026, 5, 11, 8, index).toISOString(),
  }));
  const summary = buildAssistantMemorySummary({
    history,
    context: {
      lastTopic: "INSTITUTIONAL",
      lastCategory: "Museos",
    },
    intent: "consulta_informativa",
  });

  assert.ok(summary.length <= 1000);
  assert.match(summary, /Museos/);
});
