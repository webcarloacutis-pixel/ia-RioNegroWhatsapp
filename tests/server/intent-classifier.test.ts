import test from "node:test";
import assert from "node:assert/strict";

import { analyzeUserMessageIntent } from "@/server/intent-classifier";

test("clasifica preguntas absurdas o fuera de alcance sin usar base municipal", () => {
  const empanadas = analyzeUserMessageIntent(
    "La Alcaldia vende empanadas interdimensionales?",
  );
  const pelea = analyzeUserMessageIntent("Quien gana una pelea entre Batman y Goku?");
  const dragones = analyzeUserMessageIntent("Cuantos dragones hay en Rionegro?");

  assert.equal(empanadas.intent, "ABSURD_OR_UNKNOWN");
  assert.equal(empanadas.shouldRefuseBecauseUnknown, true);
  assert.equal(empanadas.shouldUseKnowledgeBase, false);
  assert.equal(pelea.intent, "ABSURD_OR_UNKNOWN");
  assert.equal(dragones.intent, "ABSURD_OR_UNKNOWN");
  assert.equal(dragones.shouldRefuseBecauseUnknown, true);
});

test("detecta ambiguedad y pide una sola aclaracion para impuestos", () => {
  const analysis = analyzeUserMessageIntent("Necesito ayuda con impuestos");

  assert.equal(analysis.intent, "AMBIGUOUS");
  assert.equal(analysis.shouldAskClarifyingQuestion, true);
  assert.equal(analysis.shouldCreateCitizenReport, false);
});

test("no confunde saludo con pregunta municipal adicional", () => {
  const analysis = analyzeUserMessageIntent("Hola, donde queda la Alcaldia?");

  assert.equal(analysis.intent, "KNOWLEDGE_BASE_QUERY");
  assert.equal(analysis.shouldUseKnowledgeBase, true);
});

test("detecta reportes ciudadanos reales antes del asistente general", () => {
  const analysis = analyzeUserMessageIntent("Hay un accidente en Llanogrande");

  assert.equal(analysis.intent, "EMERGENCY_REPORT");
  assert.equal(analysis.shouldCreateCitizenReport, true);
  assert.equal(analysis.shouldUseKnowledgeBase, false);
});

test("no crea reporte para consultas privadas de mascotas o servicios", () => {
  const cat = analyzeUserMessageIntent(
    "Mi gato se enfermo y necesito llevarlo al veterinario 24 horas.",
  );
  const pharmacy = analyzeUserMessageIntent("Donde hay farmacia abierta?");
  const hospital = analyzeUserMessageIntent("Mi mama esta enferma, donde hay hospital?");

  assert.equal(cat.intent, "KNOWLEDGE_BASE_QUERY");
  assert.equal(cat.shouldCreateCitizenReport, false);
  assert.equal(cat.shouldUseKnowledgeBase, true);
  assert.equal(pharmacy.shouldCreateCitizenReport, false);
  assert.equal(pharmacy.shouldUseKnowledgeBase, true);
  assert.equal(hospital.shouldCreateCitizenReport, false);
});

test("pide confirmacion para ayudas urgentes ambiguas", () => {
  const analysis = analyzeUserMessageIntent("Necesito ayuda urgente con mi perro.");

  assert.equal(analysis.intent, "AMBIGUOUS");
  assert.equal(analysis.shouldCreateCitizenReport, false);
  assert.equal(analysis.shouldAskClarifyingQuestion, true);
});

test("detecta emergencias graves como reporte urgente", () => {
  const analysis = analyzeUserMessageIntent("Escuche disparos cerca al parque");

  assert.equal(analysis.intent, "EMERGENCY_REPORT");
  assert.equal(analysis.shouldCreateCitizenReport, true);
});

test("no crea reporte cuando el usuario solo pregunta como reportar", () => {
  const analysis = analyzeUserMessageIntent("Que hago para reportar un hueco?");

  assert.equal(analysis.intent, "AMBIGUOUS");
  assert.equal(analysis.shouldCreateCitizenReport, false);
  assert.equal(analysis.shouldAskClarifyingQuestion, true);
  assert.equal(analysis.isReportInformationRequest, true);
});
