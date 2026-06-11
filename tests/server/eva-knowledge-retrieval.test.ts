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

test("retrieveEvaKnowledge usa memoria para seguimiento por categoria", async () => {
  const tourismOverview = knowledgeEntry({
    id: "kb-tourism-overview",
    question: "Que lugares turisticos hay en Rionegro?",
    answer: "Rionegro tiene parques, museos, recorridos historicos y turismo rural.",
    category: "Turismo",
    intent: "TOURISM",
    tags: ["turismo", "lugares"],
    aliases: ["lugares turisticos", "turismo rionegro"],
  });
  const museum = knowledgeEntry({
    id: "kb-museo",
    question: "Museo Historico Casa de la Convencion",
    answer: "Museo de valor historico ubicado en el centro de Rionegro.",
    shortAnswer: "Museo historico en el centro.",
    category: "Museos",
    intent: "LOCATION",
    tags: ["museos", "turismo", "historia"],
    aliases: ["museos de rionegro", "casa de la convencion"],
  });
  const restaurant = knowledgeEntry({
    id: "kb-restaurant",
    question: "Restaurante del parque",
    answer: "Restaurante familiar.",
    category: "Restaurantes",
    tags: ["restaurantes"],
  });

  const result = await retrieveEvaKnowledge({
    query: "y los museos?",
    language: "es",
    intent: "consulta_informativa",
    memory: {
      lastCategory: "Turismo",
      lastKnowledgeEntries: [tourismOverview],
      recentMessages: ["Que lugares turisticos hay?"],
    },
    maxItems: 2,
    entriesOverride: [tourismOverview, museum, restaurant],
  });

  assert.equal(result.usedMemory, true);
  assert.equal(result.entries[0]?.id, "kb-museo");
  assert.notEqual(result.entries[0]?.id, "kb-restaurant");
});

test("retrieveEvaKnowledge repite la card anterior con memoria", async () => {
  const museum = knowledgeEntry({
    id: "kb-museo-repeat",
    question: "Museo Historico Casa de la Convencion",
    answer: "El museo conserva informacion historica de la Convencion de Rionegro.",
    category: "Museos",
    intent: "INFO",
    tags: ["museos", "historia"],
    aliases: ["casa de la convencion"],
  });

  const result = await retrieveEvaKnowledge({
    query: "repiteme eso",
    language: "es",
    intent: "consulta_informativa",
    memory: {
      lastCategory: "Museos",
      lastKnowledgeEntries: [museum],
      recentMessages: ["Cuentame del museo"],
    },
    maxItems: 2,
    entriesOverride: [museum],
  });

  assert.equal(result.usedMemory, true);
  assert.equal(result.entries[0]?.id, "kb-museo-repeat");
});

test("retrieveEvaKnowledge puntua campos de respuesta corta categoria intencion tags y aliases", async () => {
  const entry = knowledgeEntry({
    id: "kb-smart-fields",
    question: "Atencion de salud municipal",
    answer: "La ruta de salud municipal orienta al ciudadano.",
    shortAnswer: "Vacunacion y salud publica.",
    category: "Salud",
    intent: "HEALTH",
    tags: ["vacunacion", "salud"],
    aliases: ["jornadas de vacunacion"],
  });

  const result = await retrieveEvaKnowledge({
    query: "vacunacion",
    language: "es",
    intent: "consulta_informativa",
    maxItems: 1,
    entriesOverride: [entry],
  });

  assert.equal(result.entries[0]?.id, "kb-smart-fields");
  assert.ok(result.topScore >= 45);
  assert.match(result.strategy, /short_answer|tag|alias|hybrid|category|intent/);
});

test("retrieveEvaKnowledge encuentra servicios privados por sinonimos utiles", async () => {
  const mechanic = knowledgeEntry({
    id: "kb-mechanic",
    question: "Taller mecanico Autolarte Rionegro",
    answer: "Servicio automotriz ubicado en Rionegro.",
    category: "Mecanicos",
    intent: "PRIVATE_SERVICE",
    tags: ["taller", "automotriz"],
    aliases: ["mecanico", "arreglar carro"],
  });
  const commerce = knowledgeEntry({
    id: "kb-commerce",
    question: "Comercio local en San Antonio",
    answer: "Zona con tiendas y negocios registrados.",
    category: "Comercios",
    tags: ["comercio", "tiendas"],
    aliases: ["negocios", "locales"],
  });

  const mechanicResult = await retrieveEvaKnowledge({
    query: "necesito mecanico",
    language: "es",
    intent: "servicio",
    maxItems: 1,
    entriesOverride: [commerce, mechanic],
  });
  const commerceResult = await retrieveEvaKnowledge({
    query: "que comercios hay",
    language: "es",
    intent: "servicio",
    maxItems: 1,
    entriesOverride: [mechanic, commerce],
  });

  assert.equal(mechanicResult.entries[0]?.id, "kb-mechanic");
  assert.equal(commerceResult.entries[0]?.id, "kb-commerce");
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
