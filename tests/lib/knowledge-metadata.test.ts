import test from "node:test";
import assert from "node:assert/strict";

import {
  expandKnowledgeQueryForSearch,
  generateKnowledgeMetadata,
  getKnowledgeCategoryLabel,
  getKnowledgeIntentLabel,
  localizeKnowledgeAnswerForLanguage,
  normalizeKnowledgeQuery,
  scoreKnowledgeEntry,
} from "@/lib/knowledge-metadata";
import type { KnowledgeEntrySummary } from "@/lib/types";

test("generateKnowledgeMetadata autogenera aliases y tags para restaurante", () => {
  const metadata = generateKnowledgeMetadata({
    question: "Donde queda el restaurante Las Delicias?",
    answer: "El restaurante Las Delicias queda en el centro de Rionegro.",
    category: "Restaurantes",
    userAliases: ["ubicacion restaurante las delicias"],
  });

  assert.equal(metadata.sourceType, "manual_admin");
  assert.equal(metadata.sourceName, "Panel admin");
  assert.equal(metadata.confidence, 0.8);
  assert.equal(metadata.intent, "LOCATION");
  assert.ok(metadata.aliases.includes("direccion restaurante las delicias"));
  assert.ok(metadata.aliases.includes("como llego a restaurante las delicias"));
  assert.ok(metadata.tags.includes("restaurante las delicias"));
  assert.ok(metadata.tags.includes("rionegro"));
});

test("normalizeKnowledgeQuery limpia tildes, signos y errores comunes", () => {
  assert.equal(
    normalizeKnowledgeQuery("¿Dónde queda la dirreción de Las Delicias?"),
    "donde queda la direccion de las delicias",
  );
});

test("scoreKnowledgeEntry encuentra una ficha por pregunta variante", () => {
  const now = new Date().toISOString();
  const metadata = generateKnowledgeMetadata({
    question: "Donde queda el restaurante Las Delicias?",
    answer: "El restaurante Las Delicias queda en el centro de Rionegro.",
    category: "Restaurantes",
  });
  const entry: KnowledgeEntrySummary = {
    id: "kb-restaurant",
    question: "Donde queda el restaurante Las Delicias?",
    answer: "El restaurante Las Delicias queda en el centro de Rionegro.",
    category: "Restaurantes",
    intent: metadata.intent ?? null,
    shortAnswer: null,
    tags: metadata.tags,
    aliases: metadata.aliases,
    sourceUrl: null,
    sourceName: metadata.sourceName,
    sourceType: metadata.sourceType,
    isOfficial: false,
    isActive: true,
    needsReview: false,
    confidence: metadata.confidence,
    lastVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  assert.ok(scoreKnowledgeEntry(entry, "como llego a las delicias") >= 35);
  assert.ok(scoreKnowledgeEntry(entry, "direccion restaurante las delicias") >= 35);
});

test("scoreKnowledgeEntry encuentra ficha espanola con pregunta en ingles", () => {
  const now = new Date().toISOString();
  const entry: KnowledgeEntrySummary = {
    id: "kb-city-hall",
    question: "Donde queda la Alcaldia de Rionegro?",
    answer: "La Alcaldia de Rionegro queda en el centro, en Carrera 50 # 49 - 05.",
    category: "Alcaldia",
    intent: "LOCATION",
    shortAnswer: null,
    tags: ["alcaldia", "direccion", "rionegro"],
    aliases: ["ubicacion alcaldia", "direccion alcaldia"],
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
  };

  const expanded = expandKnowledgeQueryForSearch("Where is the City Hall of Rionegro?");
  const localized = localizeKnowledgeAnswerForLanguage(entry, "en");

  assert.match(expanded, /alcaldia/);
  assert.ok(scoreKnowledgeEntry(entry, "Where is the City Hall of Rionegro?") >= 80);
  assert.match(localized, /Rionegro City Hall/i);
  assert.match(localized, /Carrera 50 # 49 - 05/);
});

test("labels traducen categorias e intenciones tecnicas", () => {
  assert.equal(getKnowledgeCategoryLabel("ENVIRONMENT"), "Ambiente");
  assert.equal(getKnowledgeIntentLabel("LOCATION"), "Ubicacion");
});
