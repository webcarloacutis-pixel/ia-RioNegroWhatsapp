import test from "node:test";
import assert from "node:assert/strict";

import {
  formatWhatsAppReply,
  UNKNOWN_OFFICIAL_REPLY,
  validateAnswerGrounding,
  validateFinalAnswer,
} from "@/server/whatsapp-reply-style";

test("formatWhatsAppReply corta absurdos con respuesta oficial de no informacion", () => {
  const reply = formatWhatsAppReply({
    reply: "La Alcaldia tiene varias dependencias...",
    intent: "ABSURD_OR_UNKNOWN",
    userMessage: "Quien gana una pelea entre Batman y Goku?",
  });

  assert.equal(reply, UNKNOWN_OFFICIAL_REPLY);
});

test("formatWhatsAppReply elimina frases prohibidas y bullets innecesarios en preguntas simples", () => {
  const reply = formatWhatsAppReply({
    reply: [
      "A continuacion te presento:",
      "- Te puedo compartir las siguientes dependencias",
      "- Secretaria de Hacienda",
      "La Alcaldia cuenta con multiples canales.",
    ].join("\n"),
    intent: "KNOWLEDGE_BASE_QUERY",
    userMessage: "Donde queda la Alcaldia?",
  });

  assert.doesNotMatch(reply, /a continuacion/i);
  assert.doesNotMatch(reply, /te puedo compartir las siguientes dependencias/i);
  assert.doesNotMatch(reply, /^\s*(?:[-*]|\d+[.)])\s+/m);
});

test("validateAnswerGrounding bloquea datos oficiales sin fuente recuperada", () => {
  const result = validateAnswerGrounding({
    userMessage: "Cual es el telefono de una oficina?",
    answer: "El telefono es 123456.",
    retrievedKnowledge: [],
    intent: "KNOWLEDGE_BASE_QUERY",
    officialDataRequested: true,
  });

  assert.equal(result.blocked, true);
  assert.equal(result.answer, "No tengo información oficial sobre eso en este momento.");
});

test("validateFinalAnswer detecta relleno, dependencias no pedidas y frases prohibidas", () => {
  const result = validateFinalAnswer({
    userMessage: "Donde queda la Alcaldia?",
    answer:
      "A continuacion te presento las dependencias: Secretaria de Hacienda, Secretaria de Gobierno y otras oficinas.",
    intent: "KNOWLEDGE_BASE_QUERY",
    retrievedKnowledge: [{ title: "Alcaldia" }],
    officialDataRequested: true,
  });

  assert.equal(result.usesForbiddenPhrases, true);
  assert.equal(result.containsUnrequestedDependencies, true);
  assert.equal(result.shouldRewrite, true);
});

test("validateFinalAnswer detecta datos oficiales sin evidencia recuperada", () => {
  const result = validateFinalAnswer({
    userMessage: "Cual es el telefono de una oficina?",
    answer: "El telefono es 604 000 0000.",
    intent: "KNOWLEDGE_BASE_QUERY",
    retrievedKnowledge: [],
    officialDataRequested: true,
  });

  assert.equal(result.containsUnsupportedOfficialFacts, true);
  assert.equal(result.shouldRewrite, true);
});
