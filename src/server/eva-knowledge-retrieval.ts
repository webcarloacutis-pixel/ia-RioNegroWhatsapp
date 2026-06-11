import {
  detectKnowledgeTextLanguage,
  normalizeKnowledgeQuery,
  scoreKnowledgeEntry as baseScoreKnowledgeEntry,
} from "@/lib/knowledge-metadata";
import { logger } from "@/lib/logger";
import type { KnowledgeEntrySummary } from "@/lib/types";
import { getActiveKnowledgeEntries } from "@/server/knowledge-cache";
import type { InstitutionalConversationIntent } from "@/server/intent-classifier";
import type { SupportedLanguage } from "@/lib/language";

export type EvaKnowledgeSource = "db" | "cache";

export type EvaKnowledgeCandidate = KnowledgeEntrySummary & {
  relevanceScore: number;
  matchedBy: string[];
};

export type EvaKnowledgeContext = {
  entries: KnowledgeEntrySummary[];
  rankedItems: EvaKnowledgeCandidate[];
  topScore: number;
  source: EvaKnowledgeSource;
  strategy: string;
  queryNormalized: string;
  usedMemory: boolean;
  confidence: number;
  cacheAgeMs: number | null;
  dbErrorType?: string;
};

export type ConversationMemoryContext = {
  lastTopic?: string | null;
  lastCategory?: string | null;
  lastKnowledgeEntries?: KnowledgeEntrySummary[];
  lastPlace?: string | null;
  lastLanguage?: SupportedLanguage | null;
  recentMessages?: string[];
};

type RetrieveEvaKnowledgeInput = {
  query: string;
  language: SupportedLanguage;
  intent: InstitutionalConversationIntent;
  category?: string | null;
  userId?: string;
  requestId?: string;
  conversationHistory?: string[];
  memory?: ConversationMemoryContext;
  maxItems?: number;
  entriesOverride?: KnowledgeEntrySummary[];
};

const FILLER_PATTERNS = [
  /\bpor\s+favor\b/g,
  /\bporfa\b/g,
  /\bme\s+dices\b/g,
  /\bme\s+puedes\s+decir\b/g,
  /\bme\s+podrias\s+decir\b/g,
  /\bsabes\b/g,
  /\bquiero\s+saber\b/g,
  /\bnecesito\s+saber\b/g,
  /\bdime\b/g,
  /\binformacion\s+sobre\b/g,
  /\bconsulta\s+sobre\b/g,
  /\bcual\s+es\s+el\b/g,
  /\bcual\s+es\s+la\b/g,
  /\bwhat\s+is\s+the\b/g,
  /\bcan\s+you\s+tell\s+me\b/g,
  /\bi\s+want\s+to\s+know\b/g,
];

const IMPORTANT_STOP_WORDS = new Set([
  "a",
  "al",
  "and",
  "como",
  "con",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "es",
  "esta",
  "is",
  "la",
  "las",
  "los",
  "of",
  "para",
  "por",
  "que",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

const SYNONYM_GROUPS = [
  ["alcaldia", "palacio municipal", "city hall", "mayor office", "municipal building", "sede principal", "atencion al ciudadano"],
  ["direccion", "ubicacion", "donde queda", "donde esta", "address", "location", "where is", "where"],
  ["horario", "horarios", "atienden", "atencion", "abre", "cierra", "opening hours", "business hours", "schedule", "what time", "open"],
  ["predial", "impuesto predial", "property tax", "impuesto", "tax", "taxes", "pago impuesto", "pagar impuesto", "rentas", "hacienda"],
  ["denuncia", "denunciar", "reporte", "reportar", "queja", "complaint", "report"],
  ["tramite", "tramites", "requisitos", "documentos", "procedure", "requirements", "paperwork", "documents"],
  ["telefono", "contacto", "linea", "phone", "contact"],
  ["restaurante", "restaurantes", "restaurant", "food", "comida"],
  ["veterinaria", "veterinarias", "veterinario", "vet", "veterinary", "mascota", "pet"],
  ["mecanico", "mecanicos", "mecanica", "taller", "talleres", "automotriz", "mechanic", "workshop", "car repair"],
  ["hotel", "hoteles", "hospedaje", "alojamiento", "hotel", "lodging"],
  ["comercio", "comercios", "negocio", "negocios", "tienda", "local", "business", "shop"],
  ["museo", "museos", "museum", "museums", "historia"],
  ["turismo", "turistico", "tourism", "tourist", "visit", "visitar"],
];

const FOLLOW_UP_TOPICS = new Set([
  "alcaldia",
  "comercios",
  "contacto",
  "direccion",
  "emergencias",
  "eventos",
  "hoteles",
  "horario",
  "horarios",
  "mecanicos",
  "museo",
  "museos",
  "restaurante",
  "restaurantes",
  "telefono",
  "turismo",
  "ubicacion",
  "veterinarias",
]);

export function normalizeTextForKnowledge(text: string) {
  let normalized = normalizeKnowledgeQuery(text)
    .replace(/\bq\b/g, "que")
    .replace(/\bk\b/g, "que");

  for (const pattern of FILLER_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function expandQueryWithSynonyms(query: string) {
  const normalized = normalizeTextForKnowledge(query);
  const additions: string[] = [];

  for (const group of SYNONYM_GROUPS) {
    const normalizedGroup = group.map(normalizeTextForKnowledge);
    const matched = normalizedGroup.some(
      (term) => term && (normalized.includes(term) || term.includes(normalized)),
    );

    if (matched) {
      additions.push(...normalizedGroup);
    }
  }

  return Array.from(new Set([normalized, ...additions])).filter(Boolean).join(" ");
}

function getImportantTokens(text: string) {
  return expandQueryWithSynonyms(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !IMPORTANT_STOP_WORDS.has(token));
}

function includesEveryImportantToken(corpus: string, tokens: string[]) {
  if (!tokens.length) return false;
  return tokens.every((token) => corpus.includes(token));
}

function detectStrategy(matchedBy: string[]) {
  if (matchedBy.includes("memory_follow_up")) return "memory_context_match";
  if (matchedBy.includes("exact_question")) return "exact_question_match";
  if (matchedBy.includes("exact_alias")) return "alias_exact_match";
  if (matchedBy.includes("strong_alias")) return "alias_strong_match";
  if (matchedBy.includes("strong_question")) return "question_strong_match";
  if (matchedBy.includes("short_answer_match")) return "short_answer_match";
  if (matchedBy.includes("category_match")) return "category_match";
  if (matchedBy.includes("intent_match")) return "intent_match";
  if (matchedBy.includes("intent_category")) return "intent_category_match";
  if (matchedBy.includes("tag_match")) return "tag_match";
  if (matchedBy.includes("answer_match")) return "answer_text_match";
  return "hybrid_token_match";
}

function isShortFollowUp(queryNormalized: string) {
  if (
    /^(y\s+)?(el\s+|la\s+|los\s+|las\s+)?(horario|horarios|direccion|ubicacion|telefono|contacto|como llego|donde queda|donde esta|repiteme|repiteme eso|mandame eso|eso|esa|ese)$/i.test(
      queryNormalized,
    )
  ) {
    return true;
  }

  const tokens = queryNormalized
    .replace(/^y\s+/, "")
    .split(" ")
    .filter(Boolean)
    .filter((token) => !IMPORTANT_STOP_WORDS.has(token));

  if (queryNormalized.startsWith("y ") && tokens.length <= 4) {
    return true;
  }

  return tokens.length <= 3 && tokens.some((token) => FOLLOW_UP_TOPICS.has(token));
}

function shouldBoostMemoryEntries(queryNormalized: string) {
  return /^(y\s+)?(el\s+|la\s+|los\s+|las\s+)?(horario|horarios|direccion|ubicacion|telefono|contacto|como llego|donde queda|donde esta|repiteme|repiteme eso|mandame eso|eso|esa|ese)$/i.test(
    queryNormalized,
  );
}

function buildMemoryQuery(query: string, memory?: ConversationMemoryContext) {
  const memoryEntries = memory?.lastKnowledgeEntries ?? [];
  const queryNormalized = normalizeTextForKnowledge(query);
  const boostMemoryEntries = shouldBoostMemoryEntries(queryNormalized);

  if (!memoryEntries.length || !isShortFollowUp(queryNormalized)) {
    return {
      query,
      usedMemory: false,
      memoryEntries,
      boostMemoryEntries: false,
    };
  }

  const memoryText = boostMemoryEntries
    ? memoryEntries
        .slice(0, 2)
        .map((entry) =>
          [
            entry.question,
            entry.answer,
            entry.shortAnswer,
            entry.category,
            entry.intent,
            entry.aliases.join(" "),
            entry.tags.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ")
    : "";
  const contextParts = boostMemoryEntries
    ? [memoryText, memory?.lastCategory, memory?.lastPlace, memory?.recentMessages?.join(" ")]
    : [];

  return {
    query: [query, ...contextParts]
      .filter(Boolean)
      .join(" "),
    usedMemory: true,
    memoryEntries,
    boostMemoryEntries,
  };
}

export function scoreEvaKnowledgeEntry(input: {
  query: string;
  entry: KnowledgeEntrySummary;
  language: SupportedLanguage;
  intent: InstitutionalConversationIntent;
  category?: string | null;
  memoryEntries?: KnowledgeEntrySummary[];
  boostMemoryEntries?: boolean;
}) {
  const queryNormalized = normalizeTextForKnowledge(input.query);
  const expandedQuery = expandQueryWithSynonyms(input.query);
  const importantTokens = getImportantTokens(input.query);
  const question = normalizeTextForKnowledge(input.entry.question);
  const answer = normalizeTextForKnowledge(input.entry.answer);
  const shortAnswer = normalizeTextForKnowledge(input.entry.shortAnswer ?? "");
  const questionEn = normalizeTextForKnowledge(input.entry.questionEn ?? "");
  const answerEn = normalizeTextForKnowledge(input.entry.answerEn ?? "");
  const shortAnswerEn = normalizeTextForKnowledge(input.entry.shortAnswerEn ?? "");
  const category = normalizeTextForKnowledge(input.entry.category);
  const intent = normalizeTextForKnowledge(input.entry.intent ?? "");
  const aliases = input.entry.aliases.map(normalizeTextForKnowledge);
  const tags = input.entry.tags.map(normalizeTextForKnowledge);
  const aliasesEn = (input.entry.aliasesEn ?? []).map(normalizeTextForKnowledge);
  const tagsEn = (input.entry.tagsEn ?? []).map(normalizeTextForKnowledge);
  const corpus = [
    question,
    answer,
    shortAnswer,
    questionEn,
    answerEn,
    shortAnswerEn,
    category,
    intent,
    ...aliases,
    ...aliasesEn,
    ...tags,
    ...tagsEn,
  ].join(" ");
  const matchedBy: string[] = [];

  let score = Math.max(
    baseScoreKnowledgeEntry(input.entry, input.query),
    baseScoreKnowledgeEntry(input.entry, expandedQuery),
  );

  if (question === queryNormalized) {
    score += 100;
    matchedBy.push("exact_question");
  }

  if (questionEn && questionEn === queryNormalized) {
    score += 100;
    matchedBy.push("exact_question");
  }

  if (
    aliases.some((alias) => alias === queryNormalized) ||
    aliasesEn.some((alias) => alias === queryNormalized)
  ) {
    score += 90;
    matchedBy.push("exact_alias");
  }

  if (queryNormalized && (question.includes(queryNormalized) || queryNormalized.includes(question))) {
    score += 65;
    matchedBy.push("strong_question");
  }

  if (
    queryNormalized &&
    questionEn &&
    (questionEn.includes(queryNormalized) || queryNormalized.includes(questionEn))
  ) {
    score += 65;
    matchedBy.push("strong_question");
  }

  if (aliases.some((alias) => alias && (alias.includes(queryNormalized) || queryNormalized.includes(alias)))) {
    score += 70;
    matchedBy.push("strong_alias");
  }

  if (aliasesEn.some((alias) => alias && (alias.includes(queryNormalized) || queryNormalized.includes(alias)))) {
    score += 70;
    matchedBy.push("strong_alias");
  }

  if (
    tags.some((tag) => tag && queryNormalized.includes(tag)) ||
    tagsEn.some((tag) => tag && queryNormalized.includes(tag))
  ) {
    score += 30;
    matchedBy.push("tag_match");
  }

  if (input.category && category.includes(normalizeTextForKnowledge(input.category))) {
    score += 35;
    matchedBy.push("intent_category");
  }

  if (intent && intent.includes(normalizeTextForKnowledge(input.intent))) {
    score += 35;
    matchedBy.push("intent_category");
  }

  if (category && (category.includes(queryNormalized) || queryNormalized.includes(category))) {
    score += 45;
    matchedBy.push("category_match");
  }

  if (intent && (intent.includes(queryNormalized) || queryNormalized.includes(intent))) {
    score += 35;
    matchedBy.push("intent_match");
  }

  if (includesEveryImportantToken(corpus, importantTokens)) {
    score += importantTokens.length * 10;
    matchedBy.push("important_tokens");
  }

  if (queryNormalized && answer.includes(queryNormalized)) {
    score += 25;
    matchedBy.push("answer_match");
  }

  if (queryNormalized && answerEn.includes(queryNormalized)) {
    score += 25;
    matchedBy.push("answer_match");
  }

  if (
    queryNormalized &&
    (shortAnswer.includes(queryNormalized) || shortAnswerEn.includes(queryNormalized))
  ) {
    score += 45;
    matchedBy.push("short_answer_match");
  }

  const languageBonus =
    input.language === "en" && detectKnowledgeTextLanguage(`${input.entry.question} ${input.entry.answer}`) === "es"
      ? 6
      : 0;
  score += languageBonus;

  if (
    input.boostMemoryEntries &&
    input.memoryEntries?.some((entry) => entry.id === input.entry.id)
  ) {
    score += 45;
    matchedBy.push("memory_follow_up");
  }

  if (!matchedBy.length && score > 0) {
    matchedBy.push("token_overlap");
  }

  return {
    score: Math.max(0, Math.round(score)),
    matchedBy,
  };
}

export async function retrieveEvaKnowledge(
  input: RetrieveEvaKnowledgeInput,
): Promise<EvaKnowledgeContext> {
  const maxItems = Math.max(1, input.maxItems ?? 4);
  const memoryQuery = buildMemoryQuery(input.query, input.memory);
  const queryNormalized = normalizeTextForKnowledge(input.query);

  const sourceResult = input.entriesOverride
    ? {
        entries: input.entriesOverride.filter((entry) => entry.isActive),
        source: "db" as const,
        cacheAgeMs: null,
      }
    : await getActiveKnowledgeEntries({
        requestId: input.requestId,
        preferDatabase: true,
      });

  const rankedItems = sourceResult.entries
    .map((entry) => {
      const scored = scoreEvaKnowledgeEntry({
        query: memoryQuery.query,
        entry,
        language: input.language,
        intent: input.intent,
        category: input.category,
        memoryEntries: memoryQuery.usedMemory ? memoryQuery.memoryEntries : [],
        boostMemoryEntries: memoryQuery.boostMemoryEntries,
      });

      return {
        ...entry,
        relevanceScore: scored.score,
        matchedBy: scored.matchedBy,
      };
    })
    .filter((entry) => entry.relevanceScore > 0)
    .sort((left, right) => right.relevanceScore - left.relevanceScore);

  const topScore = rankedItems[0]?.relevanceScore ?? 0;
  const minimumScore = memoryQuery.usedMemory ? 25 : queryNormalized.split(" ").length <= 2 ? 30 : 35;
  const selected = rankedItems
    .filter((entry) => entry.relevanceScore >= minimumScore)
    .slice(0, maxItems);
  const strategy = detectStrategy(selected[0]?.matchedBy ?? rankedItems[0]?.matchedBy ?? []);
  const confidence = selected.length ? Math.min(0.98, 0.35 + topScore / 140) : 0.2;

  logger.info("eva-knowledge", selected.length ? "selected_entries" : "low_score_no_answer", {
    requestId: input.requestId,
    userLanguage: input.language,
    intent: input.intent,
    queryNormalized,
    entriesFound: selected.length,
    topScore,
    source: sourceResult.source,
    strategy,
    usedMemory: memoryQuery.usedMemory,
  });

  return {
    entries: selected,
    rankedItems: selected,
    topScore,
    source: sourceResult.source,
    strategy,
    queryNormalized,
    usedMemory: memoryQuery.usedMemory,
    confidence,
    cacheAgeMs: sourceResult.cacheAgeMs,
    dbErrorType: sourceResult.dbErrorType,
  };
}
