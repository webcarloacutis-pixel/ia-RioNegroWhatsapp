import { PrismaClient } from "@prisma/client";

import { buildOfficialKnowledgeEntries } from "../src/lib/rionegro-content";

const prisma = new PrismaClient();

function normalizeKey(question: string, category: string) {
  return `${question.trim().toLowerCase()}::${category.trim().toLowerCase()}`;
}

async function main() {
  const officialEntries = buildOfficialKnowledgeEntries().map((entry) => ({
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    tags: [entry.category.toLowerCase()],
    aliases: [],
    sourceUrl: "https://rionegro.gov.co/",
    sourceName: "Sitio oficial Alcaldia de Rionegro",
    sourceType: "official_seed",
    isOfficial: true,
    isActive: true,
    needsReview: false,
    confidence: 0.85,
  }));

  const existing = await prisma.knowledgeBaseEntry.findMany({
    select: { question: true, category: true },
  });
  const existingKeys = new Set(existing.map((entry) => normalizeKey(entry.question, entry.category)));
  const missingEntries = officialEntries.filter(
    (entry) => !existingKeys.has(normalizeKey(entry.question, entry.category)),
  );

  if (missingEntries.length) {
    await prisma.knowledgeBaseEntry.createMany({
      data: missingEntries,
    });
  }

  console.log("[knowledge-import] completed", {
    sourceEntries: officialEntries.length,
    existingEntries: existing.length,
    insertedEntries: missingEntries.length,
  });
}

main()
  .catch((error) => {
    console.error("[knowledge-import] failed", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
