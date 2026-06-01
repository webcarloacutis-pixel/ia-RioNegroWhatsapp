import test from "node:test";
import assert from "node:assert/strict";

import {
  addAssistantTurn,
  getAssistantSession,
  resetAssistantSession,
  updateAssistantContext,
  updateAssistantProfile,
} from "@/server/assistant-session";

test("getAssistantSession crea una sesion base con contexto por defecto", () => {
  const session = getAssistantSession("unit-session-default");

  assert.equal(session.id, "unit-session-default");
  assert.equal(session.context.conversationLanguage, "es");
  assert.equal(session.context.lastPlace, null);
});

test("updateAssistantProfile y updateAssistantContext persisten datos en sesion", () => {
  const sessionId = "unit-session-update";
  resetAssistantSession(sessionId);

  updateAssistantProfile(sessionId, {
    zone: "  Centro  ",
    userType: "  Ciudadano  ",
  });
  updateAssistantContext(sessionId, {
    conversationLanguage: "en",
    lastPlace: "Complex Llanogrande",
    lastSuggestedItems: ["Complex Llanogrande", "Mall Llanogrande"],
  });

  const session = getAssistantSession(sessionId);
  assert.equal(session.profile.zone, "Centro");
  assert.equal(session.profile.userType, "Ciudadano");
  assert.equal(session.context.conversationLanguage, "en");
  assert.equal(session.context.lastPlace, "Complex Llanogrande");
  assert.deepEqual(session.context.lastSuggestedItems, [
    "Complex Llanogrande",
    "Mall Llanogrande",
  ]);
});

test("addAssistantTurn conserva solo los ultimos 20 mensajes", () => {
  const sessionId = "unit-session-history";
  resetAssistantSession(sessionId);

  for (let index = 0; index < 25; index += 1) {
    addAssistantTurn(sessionId, "user", `mensaje ${index}`);
  }

  const session = getAssistantSession(sessionId);
  assert.equal(session.history.length, 20);
  assert.equal(session.history[0]?.content, "mensaje 5");
  assert.equal(session.history.at(-1)?.content, "mensaje 24");
});
