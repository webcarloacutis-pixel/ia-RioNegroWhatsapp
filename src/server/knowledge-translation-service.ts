import { detectKnowledgeTextLanguage, localizeKnowledgeAnswerForLanguage } from "@/lib/knowledge-metadata";
import type { KnowledgeEntrySummary } from "@/lib/types";
import { generateOpenAIText, isOpenAIConfigured, isOpenAIMockMode } from "@/server/openai-service";

export type KnowledgeEnglishTranslation = {
  questionEn: string;
  answerEn: string;
  shortAnswerEn: string | null;
  aliasesEn: string[];
  tagsEn: string[];
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function localEnglishText(value: string) {
  return value
    .replace(/\bDonde queda\b/gi, "Where is")
    .replace(/\bCual es\b/gi, "What is")
    .replace(/\bComo\b/gi, "How")
    .replace(/\bDireccion\b/gi, "Address")
    .replace(/\bTelefono\b/gi, "Phone")
    .replace(/\bCorreo\b/gi, "Email")
    .replace(/\bHorario\b/gi, "Opening hours")
    .replace(/\bAlcaldia de Rionegro\b/g, "Rionegro City Hall")
    .replace(/\bAlcaldia\b/g, "City Hall")
    .replace(/\bimpuesto predial\b/gi, "property tax")
    .replace(/\btramites\b/gi, "procedures")
    .replace(/\bturismo\b/gi, "tourism")
    .replace(/\bmuseos\b/gi, "museums")
    .replace(/\brestaurantes\b/gi, "restaurants")
    .trim();
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "";

  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function hasEnglishKnowledgeTranslation(entry: Pick<KnowledgeEntrySummary, "questionEn" | "answerEn">) {
  return Boolean(entry.questionEn?.trim() && entry.answerEn?.trim());
}

export function buildFallbackEnglishTranslation(entry: KnowledgeEntrySummary): KnowledgeEnglishTranslation {
  const alreadyEnglish = detectKnowledgeTextLanguage(`${entry.question} ${entry.answer}`) === "en";

  return {
    questionEn: alreadyEnglish ? entry.question : localEnglishText(entry.question),
    answerEn: alreadyEnglish
      ? entry.answer
      : localizeKnowledgeAnswerForLanguage(entry, "en") || localEnglishText(entry.answer),
    shortAnswerEn: entry.shortAnswer
      ? alreadyEnglish
        ? entry.shortAnswer
        : localEnglishText(localizeKnowledgeAnswerForLanguage({ ...entry, answer: entry.shortAnswer }, "en"))
      : null,
    aliasesEn: entry.aliases.map(localEnglishText).filter(Boolean),
    tagsEn: entry.tags.map(localEnglishText).filter(Boolean),
  };
}

export async function buildEnglishKnowledgeTranslation(
  entry: KnowledgeEntrySummary,
): Promise<KnowledgeEnglishTranslation> {
  if (hasEnglishKnowledgeTranslation(entry)) {
    return {
      questionEn: entry.questionEn ?? "",
      answerEn: entry.answerEn ?? "",
      shortAnswerEn: entry.shortAnswerEn ?? null,
      aliasesEn: entry.aliasesEn ?? [],
      tagsEn: entry.tagsEn ?? [],
    };
  }

  if (!isOpenAIConfigured() || isOpenAIMockMode()) {
    return buildFallbackEnglishTranslation(entry);
  }

  const generated = await generateOpenAIText({
    maxOutputTokens: 1400,
    systemPrompt:
      "You translate municipal knowledge-base cards from Spanish to clear English. Return only valid JSON. Preserve names, addresses, phone numbers, URLs, prices, schedules, and official wording. Do not add facts.",
    userPrompt: JSON.stringify({
      question: entry.question,
      answer: entry.answer,
      shortAnswer: entry.shortAnswer,
      aliases: entry.aliases,
      tags: entry.tags,
      expectedJsonShape: {
        questionEn: "string",
        answerEn: "string",
        shortAnswerEn: "string|null",
        aliasesEn: ["string"],
        tagsEn: ["string"],
      },
    }),
  });
  const parsed = generated ? parseJsonObject(generated) : null;

  if (!parsed) {
    return buildFallbackEnglishTranslation(entry);
  }

  const fallback = buildFallbackEnglishTranslation(entry);

  return {
    questionEn: cleanText(parsed.questionEn, fallback.questionEn),
    answerEn: cleanText(parsed.answerEn, fallback.answerEn),
    shortAnswerEn: parsed.shortAnswerEn === null ? null : cleanText(parsed.shortAnswerEn, fallback.shortAnswerEn ?? ""),
    aliasesEn: cleanList(parsed.aliasesEn).length ? cleanList(parsed.aliasesEn) : fallback.aliasesEn,
    tagsEn: cleanList(parsed.tagsEn).length ? cleanList(parsed.tagsEn) : fallback.tagsEn,
  };
}
