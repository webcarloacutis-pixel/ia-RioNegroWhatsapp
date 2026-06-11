import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logger, sanitizeError } from "@/lib/logger";
import type {
  AssistantChatResult,
  AssistantInstitutionalIntentValue,
  AssistantReplyMeta,
  AssistantTopicValue,
  KnowledgeEntrySummary,
  PendingCitizenReportMemory,
  PendingCitizenReportStatus,
} from "@/lib/types";
import {
  addAssistantTurn,
  getAssistantSession,
  hydrateAssistantSession,
  resetAssistantSession,
  updateAssistantContext,
  type AssistantConversationContext,
  type AssistantTurn,
} from "@/server/assistant-session";
import { sendWhatsAppText } from "@/server/messageService";

const HISTORY_LIMIT = 10;
const SUMMARY_LIMIT = 1000;
const CARD_LIMIT = 5;
const FOLLOW_UP_AFTER_MS = 30 * 60 * 1000;
const CLOSE_AFTER_FOLLOW_UP_MS = 60 * 60 * 1000;
const PENDING_REPORT_STATUSES = new Set<PendingCitizenReportStatus>([
  "collecting_location",
  "collecting_photo",
  "waiting_confirmation",
  "ready",
  "submitted",
]);
const FOLLOW_UP_MESSAGE_ES = "¿Necesitas algo más?";

type MemoryStatus = "open" | "closed";

type MemoryCard = Pick<
  KnowledgeEntrySummary,
  | "id"
  | "question"
  | "answer"
  | "questionEn"
  | "answerEn"
  | "shortAnswerEn"
  | "aliasesEn"
  | "tagsEn"
  | "translatedToEnglishAt"
  | "category"
  | "intent"
  | "shortAnswer"
  | "tags"
  | "aliases"
  | "sourceUrl"
  | "sourceName"
  | "sourceType"
  | "isOfficial"
  | "isActive"
  | "needsReview"
  | "confidence"
  | "lastVerifiedAt"
  | "createdAt"
  | "updatedAt"
>;

type TimeoutMemoryLike = {
  status: string | null;
  lastAssistantMessageAt: Date | string | null;
  followUpPromptedAt: Date | string | null;
};

export type AssistantMemoryTimeoutAction = "none" | "prompt" | "close";

function normalizeForRule(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function extractPhoneNumberFromAssistantSessionId(sessionId: string) {
  const raw = sessionId.replace(/^(whatsapp|ultramsg):/i, "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits || raw === sessionId) {
    return null;
  }

  return `+${digits}`;
}

export function isConversationClosingMessage(message: string) {
  const normalized = normalizeForRule(message);

  if (!normalized) return false;

  const exactClosers = new Set([
    "gracias",
    "muchas gracias",
    "mil gracias",
    "listo",
    "listo gracias",
    "ya gracias",
    "no gracias",
    "chao",
    "chau",
    "adios",
    "hasta luego",
    "bye",
    "thanks",
    "thank you",
    "no thanks",
    "no thank you",
    "that is all",
    "thats all",
    "eso es todo",
  ]);

  return exactClosers.has(normalized);
}

export function getConversationClosingReply(language: "es" | "en") {
  return language === "en"
    ? "You're welcome. I'll close this conversation for now. If you need anything else about Rionegro, just write again."
    : "Con gusto. Cierro esta conversación por ahora. Si necesitas algo más sobre Rionegro, vuelve a escribirme.";
}

function coerceHistory(value: unknown): AssistantTurn[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
      const content = typeof record.content === "string" ? record.content.trim() : "";
      const createdAt =
        typeof record.createdAt === "string" && !Number.isNaN(new Date(record.createdAt).getTime())
          ? record.createdAt
          : new Date().toISOString();

      if (!role || !content) return null;

      return {
        role,
        content,
        createdAt,
      };
    })
    .filter((turn): turn is AssistantTurn => Boolean(turn))
    .slice(-HISTORY_LIMIT);
}

function coerceCards(value: unknown): KnowledgeEntrySummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const question = typeof record.question === "string" ? record.question : "";
      const answer = typeof record.answer === "string" ? record.answer : "";
      const category = typeof record.category === "string" ? record.category : "";

      if (!id || !question || !category) return null;

      const entry: KnowledgeEntrySummary = {
        id,
        question,
        answer,
        questionEn: typeof record.questionEn === "string" ? record.questionEn : null,
        answerEn: typeof record.answerEn === "string" ? record.answerEn : null,
        shortAnswerEn: typeof record.shortAnswerEn === "string" ? record.shortAnswerEn : null,
        aliasesEn: Array.isArray(record.aliasesEn)
          ? record.aliasesEn.filter((alias): alias is string => typeof alias === "string")
          : [],
        tagsEn: Array.isArray(record.tagsEn)
          ? record.tagsEn.filter((tag): tag is string => typeof tag === "string")
          : [],
        translatedToEnglishAt:
          typeof record.translatedToEnglishAt === "string" ? record.translatedToEnglishAt : null,
        category,
        intent: typeof record.intent === "string" ? record.intent : null,
        shortAnswer: typeof record.shortAnswer === "string" ? record.shortAnswer : null,
        tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [],
        aliases: Array.isArray(record.aliases)
          ? record.aliases.filter((alias): alias is string => typeof alias === "string")
          : [],
        sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null,
        sourceName: typeof record.sourceName === "string" ? record.sourceName : null,
        sourceType: typeof record.sourceType === "string" ? record.sourceType : "manual_admin",
        isOfficial: typeof record.isOfficial === "boolean" ? record.isOfficial : false,
        isActive: typeof record.isActive === "boolean" ? record.isActive : true,
        needsReview: typeof record.needsReview === "boolean" ? record.needsReview : false,
        confidence: typeof record.confidence === "number" ? record.confidence : 0.7,
        lastVerifiedAt: typeof record.lastVerifiedAt === "string" ? record.lastVerifiedAt : null,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      };

      return entry;
    })
    .filter((entry): entry is KnowledgeEntrySummary => Boolean(entry))
    .slice(0, CARD_LIMIT);
}

function coercePendingCitizenReport(value: unknown): PendingCitizenReportMemory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  const priority =
    record.priority === "low" ||
    record.priority === "normal" ||
    record.priority === "high" ||
    record.priority === "urgent"
      ? record.priority
      : "normal";
  const status =
    typeof record.status === "string" &&
    PENDING_REPORT_STATUSES.has(record.status as PendingCitizenReportStatus)
      ? (record.status as PendingCitizenReportStatus)
      : null;
  const startedAt =
    typeof record.startedAt === "string" &&
    !Number.isNaN(new Date(record.startedAt).getTime())
      ? record.startedAt
      : new Date().toISOString();

  if (!type || !description || !status) {
    return null;
  }

  return {
    reportId: typeof record.reportId === "string" ? record.reportId : undefined,
    type,
    category: typeof record.category === "string" ? record.category : null,
    priority,
    description,
    location: typeof record.location === "string" ? record.location : undefined,
    address: typeof record.address === "string" ? record.address : undefined,
    sector: typeof record.sector === "string" ? record.sector : undefined,
    needsLocation: Boolean(record.needsLocation),
    needsPhoto: Boolean(record.needsPhoto),
    status,
    startedAt,
    language: record.language === "en" ? "en" : "es",
  };
}

function trimToLimit(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : normalized.slice(0, limit).trimEnd();
}

export function buildAssistantMemorySummary(input: {
  history: AssistantTurn[];
  context: Pick<AssistantConversationContext, "lastTopic" | "lastCategory">;
  intent?: AssistantInstitutionalIntentValue | null;
}) {
  const header = [
    input.context.lastTopic ? `Tema: ${input.context.lastTopic}` : null,
    input.context.lastCategory ? `Categoría: ${input.context.lastCategory}` : null,
    input.intent ? `Intención: ${input.intent}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  const turns = input.history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Usuario" : "Eva"}: ${turn.content}`)
    .join(" | ");

  return trimToLimit([header, turns].filter(Boolean).join(". "), SUMMARY_LIMIT);
}

function serializeCards(entries: KnowledgeEntrySummary[]): MemoryCard[] {
  return entries.slice(0, CARD_LIMIT).map((entry) => ({
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    questionEn: entry.questionEn,
    answerEn: entry.answerEn,
    shortAnswerEn: entry.shortAnswerEn,
    aliasesEn: entry.aliasesEn ?? [],
    tagsEn: entry.tagsEn ?? [],
    translatedToEnglishAt: entry.translatedToEnglishAt,
    category: entry.category,
    intent: entry.intent,
    shortAnswer: entry.shortAnswer,
    tags: entry.tags,
    aliases: entry.aliases,
    sourceUrl: entry.sourceUrl,
    sourceName: entry.sourceName,
    sourceType: entry.sourceType,
    isOfficial: entry.isOfficial,
    isActive: entry.isActive,
    needsReview: entry.needsReview,
    confidence: entry.confidence,
    lastVerifiedAt: entry.lastVerifiedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

function findLastTurnAt(history: AssistantTurn[], role: AssistantTurn["role"]) {
  const turn = [...history].reverse().find((item) => item.role === role);
  return toDate(turn?.createdAt) ?? null;
}

export function getAssistantMemoryTimeoutAction(
  memory: TimeoutMemoryLike,
  now = new Date(),
): AssistantMemoryTimeoutAction {
  if (memory.status !== "open") return "none";

  const lastAssistantMessageAt = toDate(memory.lastAssistantMessageAt);
  const followUpPromptedAt = toDate(memory.followUpPromptedAt);

  if (followUpPromptedAt) {
    return now.getTime() - followUpPromptedAt.getTime() >= CLOSE_AFTER_FOLLOW_UP_MS
      ? "close"
      : "none";
  }

  if (!lastAssistantMessageAt) return "none";

  return now.getTime() - lastAssistantMessageAt.getTime() >= FOLLOW_UP_AFTER_MS
    ? "prompt"
    : "none";
}

export async function hydratePersistentAssistantMemory(sessionId: string) {
  const phoneNumber = extractPhoneNumberFromAssistantSessionId(sessionId);

  if (!phoneNumber) return null;

  try {
    const memory = await prisma.assistantConversationMemory.findUnique({
      where: { phoneNumber },
    });

    if (!memory || memory.status === "closed") {
      return memory;
    }

    const cards = coerceCards(memory.lastCards);
    const language = memory.lastLanguage === "en" ? "en" : "es";

    hydrateAssistantSession(sessionId, {
      history: coerceHistory(memory.history),
      context: {
        lastTopic: (memory.lastTopic as AssistantTopicValue | null) ?? null,
        conversationLanguage: language,
        lastCategory: memory.lastCategory,
        lastKnowledgeEntries: cards,
        lastSuggestedItems: cards.map((card) => card.question).slice(0, CARD_LIMIT),
        pendingCitizenReport: coercePendingCitizenReport(memory.pendingCitizenReport),
        recentMessages: coerceHistory(memory.history)
          .filter((turn) => turn.role === "user")
          .map((turn) => turn.content)
          .slice(-3),
      },
    });

    return memory;
  } catch (error) {
    logger.warn("assistant-memory", "hydrate skipped", {
      sessionId,
      error: sanitizeError(error),
    });
    return null;
  }
}

export async function persistAssistantMemoryFromSession(
  sessionId: string,
  meta: Pick<AssistantReplyMeta, "topic" | "institutionalIntent" | "language">,
) {
  const phoneNumber = extractPhoneNumberFromAssistantSessionId(sessionId);

  if (!phoneNumber) return null;

  const session = getAssistantSession(sessionId);
  const history = session.history.slice(-HISTORY_LIMIT);
  const lastCards = serializeCards(session.context.lastKnowledgeEntries);
  const summary = buildAssistantMemorySummary({
    history,
    context: session.context,
    intent: meta.institutionalIntent,
  });
  const lastUserMessageAt = findLastTurnAt(history, "user");
  const lastAssistantMessageAt = findLastTurnAt(history, "assistant");
  const lastInteractionAt = lastUserMessageAt ?? lastAssistantMessageAt ?? new Date();

  try {
    return await prisma.assistantConversationMemory.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        sessionId,
        status: "open",
        history,
        summary,
        lastCards,
        lastTopic: session.context.lastTopic ?? meta.topic,
        lastLanguage: meta.language,
        lastCategory: session.context.lastCategory,
        lastIntent: meta.institutionalIntent,
        pendingCitizenReport: session.context.pendingCitizenReport ?? Prisma.JsonNull,
        lastUserMessageAt,
        lastAssistantMessageAt,
        lastInteractionAt,
        followUpPromptedAt: null,
        closedAt: null,
      },
      update: {
        sessionId,
        status: "open",
        history,
        summary,
        lastCards,
        lastTopic: session.context.lastTopic ?? meta.topic,
        lastLanguage: meta.language,
        lastCategory: session.context.lastCategory,
        lastIntent: meta.institutionalIntent,
        pendingCitizenReport: session.context.pendingCitizenReport ?? Prisma.JsonNull,
        lastUserMessageAt,
        lastAssistantMessageAt,
        lastInteractionAt,
        followUpPromptedAt: null,
        closedAt: null,
      },
    });
  } catch (error) {
    logger.warn("assistant-memory", "persist skipped", {
      sessionId,
      error: sanitizeError(error),
    });
    return null;
  }
}

export async function resetPersistentAssistantMemory(sessionId: string) {
  const phoneNumber = extractPhoneNumberFromAssistantSessionId(sessionId);

  if (!phoneNumber) return;

  try {
    await prisma.assistantConversationMemory.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        sessionId,
        status: "open",
        history: [],
        summary: "",
        lastCards: [],
        lastTopic: null,
        lastLanguage: "es",
        lastCategory: null,
        lastIntent: null,
        pendingCitizenReport: Prisma.JsonNull,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
        lastInteractionAt: new Date(),
        followUpPromptedAt: null,
        closedAt: null,
      },
      update: {
        sessionId,
        status: "open",
        history: [],
        summary: "",
        lastCards: [],
        lastTopic: null,
        lastLanguage: "es",
        lastCategory: null,
        lastIntent: null,
        pendingCitizenReport: Prisma.JsonNull,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
        lastInteractionAt: new Date(),
        followUpPromptedAt: null,
        closedAt: null,
      },
    });
  } catch (error) {
    logger.warn("assistant-memory", "reset skipped", {
      sessionId,
      error: sanitizeError(error),
    });
  }
}

export async function closePersistentAssistantMemory(
  sessionId: string,
  reason = "user_closed",
) {
  const phoneNumber = extractPhoneNumberFromAssistantSessionId(sessionId);

  resetAssistantSession(sessionId);

  if (!phoneNumber) return null;

  const now = new Date();

  try {
    return await prisma.assistantConversationMemory.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        sessionId,
        status: "closed",
        history: [],
        summary: trimToLimit(`Conversación cerrada: ${reason}.`, SUMMARY_LIMIT),
        lastCards: [],
        lastTopic: null,
        lastLanguage: "es",
        lastCategory: null,
        lastIntent: null,
        pendingCitizenReport: Prisma.JsonNull,
        lastUserMessageAt: now,
        lastAssistantMessageAt: null,
        lastInteractionAt: now,
        followUpPromptedAt: null,
        closedAt: now,
      },
      update: {
        status: "closed" satisfies MemoryStatus,
        pendingCitizenReport: Prisma.JsonNull,
        summary: trimToLimit(`Conversación cerrada: ${reason}.`, SUMMARY_LIMIT),
        followUpPromptedAt: null,
        closedAt: now,
        lastInteractionAt: now,
      },
    });
  } catch (error) {
    logger.warn("assistant-memory", "close skipped", {
      sessionId,
      error: sanitizeError(error),
    });
    return null;
  }
}

export async function getPendingCitizenReportFromMemory(sessionId: string) {
  await hydratePersistentAssistantMemory(sessionId);
  return getAssistantSession(sessionId).context.pendingCitizenReport;
}

export async function persistPendingCitizenReportState(input: {
  sessionId: string;
  pendingCitizenReport: PendingCitizenReportMemory | null;
  userMessage?: string;
  assistantReply?: string;
  language?: "es" | "en";
}) {
  await hydratePersistentAssistantMemory(input.sessionId);

  if (input.userMessage?.trim()) {
    addAssistantTurn(input.sessionId, "user", input.userMessage.trim());
  }

  if (input.assistantReply?.trim()) {
    addAssistantTurn(input.sessionId, "assistant", input.assistantReply.trim());
  }

  updateAssistantContext(input.sessionId, {
    pendingCitizenReport: input.pendingCitizenReport,
    conversationLanguage: input.language ?? "es",
    lastTopic: "DENUNCIAS",
  });

  return persistAssistantMemoryFromSession(input.sessionId, {
    topic: "DENUNCIAS",
    institutionalIntent: "reporte_ciudadano",
    language: input.language ?? "es",
  });
}

function appendAssistantPrompt(historyValue: unknown, message: string, now: Date) {
  const history = coerceHistory(historyValue);
  return [
    ...history,
    {
      role: "assistant" as const,
      content: message,
      createdAt: now.toISOString(),
    },
  ].slice(-HISTORY_LIMIT);
}

export async function processAssistantMemoryTimeouts(options: {
  now?: Date;
  limit?: number;
} = {}) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const result = {
    promptedCount: 0,
    closedCount: 0,
    failedCount: 0,
  };

  try {
    const closeCutoff = new Date(now.getTime() - CLOSE_AFTER_FOLLOW_UP_MS);
    const closeResult = await prisma.assistantConversationMemory.updateMany({
      where: {
        status: "open",
        followUpPromptedAt: {
          lte: closeCutoff,
        },
      },
      data: {
        status: "closed",
        closedAt: now,
        lastInteractionAt: now,
      },
    });
    result.closedCount = closeResult.count;

    const followUpCutoff = new Date(now.getTime() - FOLLOW_UP_AFTER_MS);
    const dueMemories = await prisma.assistantConversationMemory.findMany({
      where: {
        status: "open",
        followUpPromptedAt: null,
        lastAssistantMessageAt: {
          lte: followUpCutoff,
        },
      },
      orderBy: {
        lastAssistantMessageAt: "asc",
      },
      take: limit,
    });

    for (const memory of dueMemories) {
      try {
        await sendWhatsAppText({
          to: memory.phoneNumber,
          message: FOLLOW_UP_MESSAGE_ES,
        });

        const history = appendAssistantPrompt(memory.history, FOLLOW_UP_MESSAGE_ES, now);
        const summary = buildAssistantMemorySummary({
          history,
          context: {
            lastTopic: (memory.lastTopic as AssistantTopicValue | null) ?? null,
            lastCategory: memory.lastCategory,
          },
          intent: (memory.lastIntent as AssistantInstitutionalIntentValue | null) ?? null,
        });

        await prisma.assistantConversationMemory.update({
          where: { id: memory.id },
          data: {
            history,
            summary,
            followUpPromptedAt: now,
            lastAssistantMessageAt: now,
            lastInteractionAt: now,
          },
        });
        result.promptedCount += 1;
      } catch (error) {
        result.failedCount += 1;
        logger.warn("assistant-memory", "timeout prompt failed", {
          id: memory.id,
          error: sanitizeError(error),
        });
      }
    }

    if (result.promptedCount || result.closedCount || result.failedCount) {
      logger.info("assistant-memory", "timeouts processed", result);
    }

    return result;
  } catch (error) {
    logger.warn("assistant-memory", "timeouts skipped", {
      error: sanitizeError(error),
    });
    result.failedCount += 1;
    return result;
  }
}

export function attachMemoryMeta(result: AssistantChatResult) {
  return result;
}
