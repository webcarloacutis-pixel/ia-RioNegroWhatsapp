import test from "node:test";
import assert from "node:assert/strict";

import type { KnowledgeEntrySummary } from "@/lib/types";
import { cleanFinalReplyText } from "@/lib/text-encoding";
import {
  analyzeCitizenAlertIntent,
  detectCitizenReportIntent,
} from "@/server/citizen-report-service";
import {
  ALL_RIONEGRENSES_SEGMENT_NAME,
  mergeRecipientPhones,
} from "@/server/citizen-segmentation-service";
import { determineResponseChannel, getInputChannel } from "@/server/eva-channel";
import { retrieveEvaKnowledge } from "@/server/eva-knowledge-retrieval";
import {
  getElevenLabsVoiceForLanguage,
  prepareAudioAnswer,
} from "@/server/elevenlabs-service";
import { formatWhatsAppReply } from "@/server/whatsapp-reply-style";

const now = new Date("2026-06-01T12:00:00.000Z").toISOString();

function knowledgeEntry(
  input: Partial<KnowledgeEntrySummary> &
    Pick<KnowledgeEntrySummary, "id" | "question" | "answer" | "category">,
): KnowledgeEntrySummary {
  return {
    intent: null,
    shortAnswer: null,
    tags: [],
    aliases: [],
    sourceUrl: null,
    sourceName: "QA final",
    sourceType: "manual_admin",
    isOfficial: false,
    isActive: true,
    needsReview: false,
    confidence: 0.9,
    lastVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

test("QA final: texto entra y texto sale; texto ingles conserva ingles", () => {
  assert.equal(getInputChannel({ incomingMessageType: "chat", hasText: true }), "text");
  assert.equal(
    determineResponseChannel({ incomingMessageType: "chat", hasText: true }),
    "text",
  );

  const reply = formatWhatsAppReply({
    userMessage: "Where is Rionegro City Hall?",
    reply: "Rionegro City Hall is located at Carrera 50 # 49 - 05.",
    intent: "KNOWLEDGE_BASE_QUERY",
    sourceConfidence: 0.95,
  });

  assert.match(reply, /Rionegro City Hall/i);
  assert.doesNotMatch(reply, /Alcald[ií]a/i);
});

test("QA final: audio entra y audio sale; audio ingles usa voz inglesa fija", () => {
  assert.equal(getInputChannel({ incomingMessageType: "ptt", hasAudio: true }), "audio");
  assert.equal(
    determineResponseChannel({ incomingMessageType: "ptt", hasAudio: true, hasText: true }),
    "audio",
  );
  assert.equal(getElevenLabsVoiceForLanguage("en"), "6rOxfAnZpbM3VIEhFaeV");
});

test("QA final: audio se corta por oracion completa y nunca con puntos suspensivos", () => {
  const result = prepareAudioAnswer({
    fullAnswer: [
      "La Alcaldía de Rionegro queda en el Palacio Municipal, Carrera 50 #49-05.",
      "El horario general de atención se maneja con base en los canales oficiales.",
      "Si necesitas más detalles, revisa la respuesta escrita completa antes de ir.",
    ].join(" "),
    language: "es",
    maxSeconds: 35,
    minSeconds: 3,
  });

  assert.match(result.audioText, /[.!?]$/);
  assert.doesNotMatch(result.audioText, /\.\.\./);
  assert.doesNotMatch(result.audioText.toLowerCase(), /\b(y|o|por ejemplo|tambien|ademas)\.?$/);
  assert.ok(wordCount(result.audioText) <= 90);
});

test("QA final: memoria permite seguimiento con museos", async () => {
  const tourism = knowledgeEntry({
    id: "qa-tourism",
    question: "Que lugares turisticos hay en Rionegro?",
    answer: "Rionegro tiene parques, museos y recorridos historicos.",
    category: "Turismo",
    tags: ["turismo", "lugares"],
  });
  const museum = knowledgeEntry({
    id: "qa-museum",
    question: "Museo Historico Casa de la Convencion",
    answer: "Museo historico ubicado en el centro de Rionegro.",
    category: "Museos",
    tags: ["museos", "historia"],
    aliases: ["museos de rionegro"],
  });

  const result = await retrieveEvaKnowledge({
    query: "y los museos?",
    language: "es",
    intent: "consulta_informativa",
    memory: {
      lastCategory: "Turismo",
      lastKnowledgeEntries: [tourism],
      recentMessages: ["Que lugares turisticos hay?"],
    },
    entriesOverride: [tourism, museum],
  });

  assert.equal(result.usedMemory, true);
  assert.equal(result.entries[0]?.id, "qa-museum");
});

test("QA final: veterinaria no crea reporte y moto caida si crea reporte", () => {
  const vet = analyzeCitizenAlertIntent({
    text: "Mi gato esta enfermo y necesito veterinaria.",
  });
  const motorcycle = detectCitizenReportIntent("Se cayo una moto.");

  assert.equal(vet.intent, "PRIVATE_SERVICE_QUERY");
  assert.equal(vet.shouldCreateAlert, false);
  assert.equal(motorcycle.isReport, true);
  assert.equal(motorcycle.category, "Accidente");
});

test("QA final: numero entrante queda en Todos los rionegrenses sin duplicarse", () => {
  const merged = mergeRecipientPhones(["+573108853158"], "310 885 3158");

  assert.equal(ALL_RIONEGRENSES_SEGMENT_NAME, "Todos los rionegrenses");
  assert.deepEqual(merged, ["+573108853158"]);
});

test("QA final: respuesta conserva ene/tildes y no dice sin informacion si encontro card", async () => {
  const entry = knowledgeEntry({
    id: "qa-spanish-card",
    question: "Donde queda el museo del nino?",
    answer: "El Museo del Niño queda abierto mañana y tiene recorridos para niños de 6 años.",
    category: "Museos",
    tags: ["museos", "niños"],
  });
  const retrieval = await retrieveEvaKnowledge({
    query: "donde queda el museo del nino",
    language: "es",
    intent: "ubicacion",
    entriesOverride: [entry],
  });
  const reply = formatWhatsAppReply({
    userMessage: "Donde queda el museo del nino?",
    reply: retrieval.entries[0]?.answer ?? "",
    intent: "KNOWLEDGE_BASE_QUERY",
    sourceConfidence: retrieval.confidence,
  });

  assert.equal(
    cleanFinalReplyText("manana nino anos espanol", "es"),
    "mañana niño años español",
  );
  assert.doesNotMatch(reply, /No tengo informaci[oó]n oficial/i);
  assert.match(reply, /Niño|niños|mañana|años/i);
});
