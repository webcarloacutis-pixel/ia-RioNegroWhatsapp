import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeConversationIntent,
  buildClarifyingQuestion,
  generateGroundedAnswer,
  retrieveRelevantKnowledge,
  routeConversationBeforeAssistant,
  validateKnowledgeGrounding,
} from "@/server/conversation-router";

test("analyzeConversationIntent devuelve contrato conversacional completo", () => {
  const greeting = analyzeConversationIntent({ userMessage: "Hola" });
  const location = analyzeConversationIntent({ userMessage: "Donde queda la Alcaldia?" });
  const absurd = analyzeConversationIntent({
    userMessage: "La Alcaldia vende empanadas interdimensionales?",
  });

  assert.equal(greeting.intent, "GREETING");
  assert.equal(greeting.expectedAnswerShape, "one_sentence");
  assert.equal(location.intent, "SIMPLE_LOCATION");
  assert.equal(location.needsKnowledgeBase, true);
  assert.equal(absurd.intent, "ABSURD_OR_UNKNOWN");
  assert.equal(absurd.shouldRefuseBecauseUnknown, true);
});

test("routeConversationBeforeAssistant corta reportes reales antes del asistente general", () => {
  const noLocation = routeConversationBeforeAssistant("Hay un accidente en Rionegro");
  const withLocation = routeConversationBeforeAssistant("Hay un accidente en Llanogrande");
  const reportQuestion = routeConversationBeforeAssistant("Como pongo una denuncia?");

  assert.equal(noLocation.analysis.shouldCreateCitizenReport, true);
  assert.match(noLocation.reply ?? "", /ubicacion exacta|sector/i);
  assert.equal(withLocation.analysis.shouldCreateCitizenReport, true);
  assert.match(withLocation.reply ?? "", /accidente/i);
  assert.match(withLocation.reply ?? "", /Llanogrande/i);
  assert.doesNotMatch(withLocation.reply ?? "", /dime.*sector/i);
  assert.equal(reportQuestion.analysis.shouldCreateCitizenReport, false);
  assert.equal(
    reportQuestion.reply,
    "Claro. Cuentame que paso y en que sector para poder registrar el reporte.",
  );

  const englishReportQuestion = routeConversationBeforeAssistant("How can I report a pothole?");
  assert.equal(englishReportQuestion.analysis.shouldCreateCitizenReport, false);
  assert.match(englishReportQuestion.reply ?? "", /Tell me where the pothole is|register/i);
});

test("routeConversationBeforeAssistant no registra consultas privadas de veterinaria", () => {
  const result = routeConversationBeforeAssistant(
    "Mi gato se enfermo y necesito llevarlo al veterinario 24 horas.",
  );

  assert.equal(result.analysis.shouldCreateCitizenReport, false);
  assert.equal(result.analysis.shouldUseKnowledgeBase, true);
  assert.equal(result.reply, null);
});

test("routeConversationBeforeAssistant pide confirmacion para ayuda urgente con mascota", () => {
  const result = routeConversationBeforeAssistant("Necesito ayuda urgente con mi perro.");

  assert.equal(result.analysis.shouldCreateCitizenReport, false);
  assert.equal(result.analysis.shouldAskClarifyingQuestion, true);
  assert.match(result.reply ?? "", /mascota|alerta/i);
  assert.doesNotMatch(result.reply ?? "", /registramos/i);
});

test("routeConversationBeforeAssistant conserva ubicacion parcial de arbol caido", () => {
  const result = routeConversationBeforeAssistant("Hay un arbol caido en la via San Antonio");

  assert.equal(result.analysis.shouldCreateCitizenReport, true);
  assert.match(result.reply ?? "", /arbol caido/i);
  assert.match(result.reply ?? "", /via San Antonio/i);
  assert.match(result.reply ?? "", /foto/i);
  assert.doesNotMatch(result.reply ?? "", /dime.*sector/i);
});

test("buildClarifyingQuestion hace una sola pregunta para impuestos", () => {
  const reply = buildClarifyingQuestion("Necesito ayuda con impuestos");

  assert.equal(reply, "Claro. Te refieres al impuesto predial, industria y comercio u otro pago?");
  assert.equal((reply.match(/\?/g) ?? []).length, 1);
});

test("retrieveRelevantKnowledge trae maximo tres entradas relevantes", async () => {
  const items = await retrieveRelevantKnowledge({
    userMessage: "Donde queda la Alcaldia de Rionegro?",
    intent: "SIMPLE_LOCATION",
    maxItems: 3,
  });

  assert.ok(items.length >= 1);
  assert.ok(items.length <= 3);
  assert.match(`${items[0]?.question} ${items[0]?.answer}`, /Alcaldia|Rionegro/i);
});

test("validateKnowledgeGrounding bloquea pregunta oficial sin evidencia suficiente", () => {
  const result = validateKnowledgeGrounding({
    userMessage: "Cual es el telefono de la oficina inventada?",
    intent: "KNOWLEDGE_BASE_QUERY",
    retrievedKnowledge: [],
  });

  assert.equal(result.hasEnoughEvidence, false);
  assert.match(result.reason, /No hay informacion oficial suficiente/i);
});

test("generateGroundedAnswer no inventa si falta knowledge", () => {
  const answer = generateGroundedAnswer({
    userMessage: "Cual es el telefono de la oficina inventada?",
    intent: "KNOWLEDGE_BASE_QUERY",
    retrievedKnowledge: [],
  });

  assert.equal(answer, "No tengo informacion oficial sobre eso en este momento.");

  const english = generateGroundedAnswer({
    userMessage: "What is the phone number of the invented office?",
    intent: "KNOWLEDGE_BASE_QUERY",
    retrievedKnowledge: [],
    language: "en",
  });

  assert.equal(english, "I don't have official information about that at the moment.");
});
