import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTextForKnowledge,
  retrieveEvaKnowledge,
} from "@/server/eva-knowledge-retrieval";
import type { KnowledgeEntrySummary } from "@/lib/types";

const now = new Date("2026-06-01T12:00:00.000Z").toISOString();

function knowledgeEntry(input: Partial<KnowledgeEntrySummary> & Pick<KnowledgeEntrySummary, "id" | "question" | "answer" | "category">): KnowledgeEntrySummary {
  return {
    intent: null,
    shortAnswer: null,
    tags: [],
    aliases: [],
    sourceUrl: null,
    sourceName: "Panel admin",
    sourceType: "manual_admin",
    isOfficial: false,
    isActive: true,
    needsReview: false,
    confidence: 0.8,
    lastVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

test("normalizeTextForKnowledge limpia muletillas y variantes cortas", () => {
  assert.equal(
    normalizeTextForKnowledge("Porfa, me puedes decir q horario tiene la Alcaldia?"),
    "que horario tiene la alcaldia",
  );
});

test("retrieveEvaKnowledge encuentra ficha espanola con consulta en ingles", async () => {
  const entries = [
    knowledgeEntry({
      id: "kb-city-hall",
      question: "Donde queda la Alcaldia de Rionegro?",
      answer: "La Alcaldia de Rionegro queda en Carrera 50 # 49 - 05.",
      category: "Alcaldia",
      intent: "LOCATION",
      tags: ["alcaldia", "direccion", "rionegro"],
      aliases: ["ubicacion alcaldia", "direccion alcaldia"],
    }),
    knowledgeEntry({
      id: "kb-park",
      question: "Lugar turistico: Parque Lineal del Rio Negro",
      answer: "Espacio para caminar junto al rio.",
      category: "Turismo",
      tags: ["turismo", "parque"],
    }),
  ];

  const result = await retrieveEvaKnowledge({
    query: "Where is city hall?",
    language: "en",
    intent: "ubicacion",
    maxItems: 2,
    entriesOverride: entries,
  });

  assert.equal(result.entries[0]?.id, "kb-city-hall");
  assert.equal(result.source, "db");
  assert.ok(result.topScore >= 35);
  assert.match(result.strategy, /alias|question|token|tag|hybrid|intent/);
});

test("retrieveEvaKnowledge usa memoria para preguntas de seguimiento", async () => {
  const cityHall = knowledgeEntry({
    id: "kb-city-hall-hours",
    question: "Cual es el horario de la Alcaldia de Rionegro?",
    answer: "La Alcaldia atiende de lunes a viernes de 8:00 a. m. a 5:00 p. m.",
    category: "Alcaldia",
    intent: "HOURS",
    tags: ["alcaldia", "horario"],
    aliases: ["horario alcaldia", "atencion alcaldia"],
  });
  const entries = [
    cityHall,
    knowledgeEntry({
      id: "kb-restaurant",
      question: "Donde queda el restaurante Las Delicias?",
      answer: "El restaurante queda en el centro.",
      category: "Restaurantes",
      tags: ["restaurante"],
    }),
  ];

  const result = await retrieveEvaKnowledge({
    query: "y el horario?",
    language: "es",
    intent: "horario",
    memory: {
      lastCategory: "Alcaldia",
      lastKnowledgeEntries: [cityHall],
      recentMessages: ["Donde queda la Alcaldia?"],
    },
    maxItems: 2,
    entriesOverride: entries,
  });

  assert.equal(result.usedMemory, true);
  assert.equal(result.entries[0]?.id, "kb-city-hall-hours");
  assert.equal(result.strategy, "memory_context_match");
});

test("retrieveEvaKnowledge no entrega fichas con baja evidencia", async () => {
  const result = await retrieveEvaKnowledge({
    query: "Quien canta mejor regueton?",
    language: "es",
    intent: "desconocido",
    maxItems: 2,
    entriesOverride: [
      knowledgeEntry({
        id: "kb-city-hall",
        question: "Donde queda la Alcaldia de Rionegro?",
        answer: "La Alcaldia queda en el centro.",
        category: "Alcaldia",
      }),
    ],
  });

  assert.equal(result.entries.length, 0);
  assert.equal(result.confidence, 0.2);
});
