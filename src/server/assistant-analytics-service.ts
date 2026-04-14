import { subDays } from "date-fns";

import {
  ASSISTANT_ROUTE_LABELS,
  ASSISTANT_TOPIC_LABELS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type {
  AssistantAnalyticsSummary,
  AssistantProfile,
  AssistantRouteValue,
  AssistantTopicValue,
} from "@/lib/types";

type AssistantQueryLogInput = {
  sessionId: string;
  userMessage: string;
  assistantReply: string;
  topic: AssistantTopicValue;
  route: AssistantRouteValue;
  usedOpenAI: boolean;
  profile: AssistantProfile;
};

type AssistantQueryLogRecord = AssistantQueryLogInput & {
  id: string;
  createdAt: Date;
};

const globalForAssistantAnalytics = globalThis as unknown as {
  __rionegroAssistantLogs?: AssistantQueryLogRecord[];
};

let fallbackWarningShown = false;

function getMockStore() {
  if (!globalForAssistantAnalytics.__rionegroAssistantLogs) {
    globalForAssistantAnalytics.__rionegroAssistantLogs = [];
  }

  return globalForAssistantAnalytics.__rionegroAssistantLogs;
}

function createId() {
  return `assistant_${Math.random().toString(36).slice(2, 10)}`;
}

function isDatabaseUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Authentication failed against database server") ||
    error.message.includes("Can't reach database server") ||
    error.message.includes("Timed out fetching a new connection") ||
    error.message.includes("Error querying the database")
  );
}

async function withMockFallback<T>(
  runWithDatabase: () => Promise<T>,
  runWithMock: () => Promise<T>,
) {
  try {
    return await runWithDatabase();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    if (!fallbackWarningShown) {
      console.warn(
        "[assistant-analytics] PostgreSQL no esta disponible. Se activan metricas en memoria para el asistente.",
      );
      fallbackWarningShown = true;
    }

    return runWithMock();
  }
}

async function recordAssistantQueryDb(input: AssistantQueryLogInput) {
  await prisma.assistantQueryLog.create({
    data: {
      sessionId: input.sessionId,
      zone: input.profile.zone,
      userType: input.profile.userType,
      userMessage: input.userMessage,
      assistantReply: input.assistantReply,
      detectedTopic: input.topic,
      route: input.route,
      usedOpenAI: input.usedOpenAI,
    },
  });
}

async function recordAssistantQueryMock(input: AssistantQueryLogInput) {
  getMockStore().unshift({
    id: createId(),
    createdAt: new Date(),
    ...input,
  });
}

function buildDailyUsage(logs: { createdAt: Date }[]) {
  const lastSevenDays = Array.from({ length: 7 }).map((_, index) => subDays(new Date(), 6 - index));
  const map = new Map(
    lastSevenDays.map((day) => [
      day.toISOString().slice(0, 10),
      {
        label: new Intl.DateTimeFormat("es-CO", {
          month: "short",
          day: "numeric",
        }).format(day),
        value: 0,
      },
    ]),
  );

  for (const log of logs) {
    const key = log.createdAt.toISOString().slice(0, 10);
    const current = map.get(key);

    if (current) {
      current.value += 1;
    }
  }

  return Array.from(map.values());
}

function buildAnalyticsSummary(logs: AssistantQueryLogRecord[]): AssistantAnalyticsSummary {
  const topicMap = new Map<AssistantTopicValue, number>();
  const questionMap = new Map<string, number>();
  const todayKey = new Date().toISOString().slice(0, 10);

  for (const log of logs) {
    topicMap.set(log.topic, (topicMap.get(log.topic) ?? 0) + 1);
    questionMap.set(log.userMessage, (questionMap.get(log.userMessage) ?? 0) + 1);
  }

  const topTopic = Array.from(topicMap.entries()).sort((left, right) => right[1] - left[1])[0];
  const topQuestion = Array.from(questionMap.entries()).sort((left, right) => right[1] - left[1])[0];

  return {
    totals: {
      totalQueries: logs.length,
      todayQueries: logs.filter((log) => log.createdAt.toISOString().slice(0, 10) === todayKey).length,
      topTopic: topTopic ? ASSISTANT_TOPIC_LABELS[topTopic[0]] : "Sin datos",
      topQuestion: topQuestion?.[0] ?? "Sin datos",
    },
    topicBreakdown: Array.from(topicMap.entries())
      .map(([topic, value]) => ({
        label: ASSISTANT_TOPIC_LABELS[topic],
        value,
      }))
      .sort((left, right) => right.value - left.value),
    dailyUsage: buildDailyUsage(logs),
    frequentQuestions: Array.from(questionMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5),
    recentQueries: logs.slice(0, 6).map((log) => ({
      message: log.userMessage,
      topic: ASSISTANT_TOPIC_LABELS[log.topic],
      route: ASSISTANT_ROUTE_LABELS[log.route],
      usedOpenAI: log.usedOpenAI,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

async function getAssistantAnalyticsSummaryDb() {
  const logs = await prisma.assistantQueryLog.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 250,
  });

  return buildAnalyticsSummary(
    logs.map((log) => ({
      id: log.id,
      sessionId: log.sessionId,
      userMessage: log.userMessage,
      assistantReply: log.assistantReply,
      topic: log.detectedTopic as AssistantTopicValue,
      route: log.route as AssistantRouteValue,
      usedOpenAI: log.usedOpenAI,
      profile: {
        zone: log.zone,
        userType: log.userType,
      },
      createdAt: log.createdAt,
    })),
  );
}

async function getAssistantAnalyticsSummaryMock() {
  return buildAnalyticsSummary(getMockStore());
}

export async function recordAssistantQuery(input: AssistantQueryLogInput) {
  return withMockFallback(
    () => recordAssistantQueryDb(input),
    () => recordAssistantQueryMock(input),
  );
}

export async function getAssistantAnalyticsSummary() {
  return withMockFallback(
    getAssistantAnalyticsSummaryDb,
    getAssistantAnalyticsSummaryMock,
  );
}
