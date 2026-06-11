import test from "node:test";
import assert from "node:assert/strict";

import {
  bulkUpdateKnowledgeEntries,
  createKnowledgeEntry,
  listKnowledgeDashboard,
  markKnowledgeEntryReviewed,
  resetMockStoreForTests,
  testKnowledgeAnswer,
  toggleKnowledgeEntryActive,
} from "@/server/mock-store";

const baseKnowledgeInput = {
  question: "Donde queda Movilidad Rionegro?",
  answer: "Movilidad Rionegro atiende en Carrera 47 No. 62-50.",
  category: "Movilidad",
  intent: "MOBILITY",
  shortAnswer: "Movilidad Rionegro atiende en Carrera 47 No. 62-50.",
  tags: ["movilidad", "transito"],
  aliases: ["comparendo", "multa"],
  sourceUrl: "https://movilidad.rionegro.gov.co/web/contactenos/",
  sourceName: "Movilidad Rionegro",
  sourceType: "official_website",
  isOfficial: true,
  isActive: true,
  needsReview: true,
  confidence: 0.65,
  lastVerifiedAt: null,
};

test("knowledge dashboard lista con paginacion, filtros y busqueda por alias", async () => {
  resetMockStoreForTests();

  const entry = await createKnowledgeEntry(baseKnowledgeInput);
  await createKnowledgeEntry({
    ...baseKnowledgeInput,
    question: "Como poner una PQRS?",
    answer: "Puedes orientar la PQRS por canales oficiales.",
    category: "PQRS",
    intent: "PQRS",
    aliases: ["peticion"],
    tags: ["pqrs"],
    needsReview: false,
    confidence: 0.85,
  });

  const result = await listKnowledgeDashboard({
    q: "comparendo",
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, entry.id);
  assert.equal(result.pagination.total, 1);
  assert.equal(result.summary.needsReview, 1);
  assert.ok(result.facets.categories.some((facet) => facet.value === "Movilidad"));
  assert.ok(result.facets.tags.some((facet) => facet.value === "transito"));
});

test("knowledge dashboard acciones puntuales y masivas actualizan fichas", async () => {
  resetMockStoreForTests();

  const entry = await createKnowledgeEntry(baseKnowledgeInput);

  const reviewed = await markKnowledgeEntryReviewed(entry.id);
  assert.equal(reviewed.needsReview, false);
  assert.ok(reviewed.lastVerifiedAt);

  const inactive = await toggleKnowledgeEntryActive(entry.id);
  assert.equal(inactive.isActive, false);
  await toggleKnowledgeEntryActive(entry.id);

  const translated = await bulkUpdateKnowledgeEntries({
    ids: [entry.id],
    action: "translateToEnglish",
  });
  assert.equal(translated.updated, 1);

  const skipped = await bulkUpdateKnowledgeEntries({
    ids: [entry.id],
    action: "translateToEnglish",
  });
  assert.equal(skipped.updated, 0);
  assert.equal(skipped.skipped, 1);
  const translatedResult = await listKnowledgeDashboard({ q: "Movilidad", page: 1, pageSize: 10 });
  assert.ok(translatedResult.items[0]?.questionEn);
  assert.ok(translatedResult.items[0]?.answerEn);

  await bulkUpdateKnowledgeEntries({
    ids: [entry.id],
    action: "changeCategory",
    category: "Transito",
  });

  const result = await listKnowledgeDashboard({ category: "Transito" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.category, "Transito");
});

test("knowledge dashboard prueba con Eva no inventa si no hay evidencia", async () => {
  resetMockStoreForTests();

  await createKnowledgeEntry(baseKnowledgeInput);

  const answer = await testKnowledgeAnswer({
    question: "Donde queda movilidad?",
  });
  const unknown = await testKnowledgeAnswer({
    question: "Dime una farmacia abierta ahora",
  });

  assert.equal(answer.wouldSayUnknown, false);
  assert.match(answer.answer, /Movilidad/i);
  assert.equal(unknown.wouldSayUnknown, true);
});
