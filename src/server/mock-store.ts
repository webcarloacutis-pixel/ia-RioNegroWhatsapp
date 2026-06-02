import { type AnnouncementStatus, type DeliveryMode } from "@prisma/client";
import { subDays } from "date-fns";

import {
  DEFAULT_ANNOUNCEMENT_TYPES,
  DEFAULT_AUDIENCE_SIZE,
  formatAnnouncementTypeLabel,
  normalizeAnnouncementType,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { parseBogotaDateTimeLocalToUtcDate } from "@/lib/format";
import {
  buildOfficialAnnouncements,
  buildOfficialKnowledgeEntries,
  officialSegments,
} from "@/lib/rionegro-content";
import type {
  AnnouncementSummary,
  DashboardData,
  DeliveryLogSummary,
  KnowledgeEntrySummary,
  MetricsData,
  SchedulerData,
  SegmentSummary,
} from "@/lib/types";
import { sendMessage } from "@/server/messageService";

type AnnouncementInput = {
  title: string;
  message: string;
  location: string | null;
  type: string;
  scheduledAt: string;
  segmentId: string | null;
};

type SegmentInput = {
  name: string;
  description: string | null;
  estimatedUsers: number;
  recipientPhones: string[];
};

type KnowledgeInput = {
  question: string;
  answer: string;
  category: string;
};

type MockSegment = {
  id: string;
  name: string;
  description: string | null;
  estimatedUsers: number;
  recipientPhones: string[];
  createdAt: Date;
  updatedAt: Date;
};

type MockAnnouncement = {
  id: string;
  title: string;
  message: string;
  location: string | null;
  type: string;
  customTypeLabel: string | null;
  scheduledAt: Date;
  status: AnnouncementStatus;
  sentAt: Date | null;
  segmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockKnowledgeEntry = {
  id: string;
  question: string;
  answer: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockDeliveryLog = {
  id: string;
  announcementId: string;
  segmentId: string | null;
  mode: DeliveryMode;
  status: "SUCCESS" | "FAILED";
  deliveredCount: number;
  details: string | null;
  createdAt: Date;
};

type MockState = {
  segments: MockSegment[];
  announcements: MockAnnouncement[];
  knowledgeEntries: MockKnowledgeEntry[];
  deliveryLogs: MockDeliveryLog[];
};

const globalForMockStore = globalThis as unknown as {
  __rionegroMockStore?: MockState;
};

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseScheduledDate(value: string) {
  const date = parseBogotaDateTimeLocalToUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("La fecha programada no es valida.");
  }

  return date;
}

function buildFallbackTrend() {
  const days = Array.from({ length: 7 }).map((_, index) =>
    subDays(new Date(), 6 - index),
  );

  return days.map((day) => ({
    key: day.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat("es-CO", {
      month: "short",
      day: "numeric",
    }).format(day),
    deliveries: 0,
  }));
}

function buildTrendFromLogs(logs: { createdAt: Date }[]) {
  const map = new Map(
    buildFallbackTrend().map((item) => [item.key, { ...item }]),
  );

  for (const log of logs) {
    const key = log.createdAt.toISOString().slice(0, 10);
    const current = map.get(key);

    if (current) {
      current.deliveries += 1;
    }
  }

  return Array.from(map.values()).map((item) => ({
    label: item.label,
    deliveries: item.deliveries,
  }));
}

function buildTypeBreakdown(typeValues: Array<{ type: string; customTypeLabel: string | null }>) {
  const counts = new Map<string, number>();

  for (const item of typeValues) {
    const normalized = normalizeAnnouncementType(item.customTypeLabel ?? item.type);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return Array.from(new Set([...DEFAULT_ANNOUNCEMENT_TYPES, ...counts.keys()])).map((type) => ({
    label: formatAnnouncementTypeLabel(type),
    value: counts.get(type) ?? 0,
  }));
}

function resolveAnnouncementTypeInput(value: string) {
  const normalized = normalizeAnnouncementType(value);

  if ((DEFAULT_ANNOUNCEMENT_TYPES as readonly string[]).includes(normalized)) {
    return {
      type: normalized,
      customTypeLabel: null as string | null,
    };
  }

  return {
    type: "GENERAL",
    customTypeLabel: formatAnnouncementTypeLabel(value),
  };
}

function initializeState(): MockState {
  const now = new Date();

  const segments: MockSegment[] = officialSegments.map((segment) => ({
    id: createId("seg"),
    name: segment.name,
    description: segment.description,
    estimatedUsers: segment.estimatedUsers,
    recipientPhones: [],
    createdAt: now,
    updatedAt: now,
  }));

  const segmentByName = new Map(segments.map((segment) => [segment.name, segment.id]));

  const announcements: MockAnnouncement[] = buildOfficialAnnouncements(now).map((item) => {
    let segmentId: string | null = segmentByName.get("Cobertura municipal") ?? null;

    if (item.location === "Vereda Mampuesto") {
      segmentId = segmentByName.get("Zona rural y corregimientos") ?? segmentId;
    } else if (item.location === "Biblioteca Baldomero Sanin") {
      segmentId = segmentByName.get("Cultura y bibliotecas") ?? segmentId;
    } else if (item.location === "Casa CincoPasitos") {
      segmentId = segmentByName.get("Primera infancia y familias") ?? segmentId;
    } else if (item.location === "Instituciones educativas del municipio") {
      segmentId = segmentByName.get("Comunidad educativa") ?? segmentId;
    }

    const scheduledAt = new Date(item.scheduledAt);

    return {
      id: createId("ann"),
      title: item.title,
      message: item.message,
      location: item.location,
      type: normalizeAnnouncementType(item.type),
      customTypeLabel: null,
      scheduledAt,
      status: item.status,
      sentAt: item.status === "SENT" || item.status === "SENT_REAL" ? scheduledAt : null,
      segmentId,
      createdAt: scheduledAt,
      updatedAt: scheduledAt,
    };
  });

  const knowledgeEntries: MockKnowledgeEntry[] = buildOfficialKnowledgeEntries().map(
    (entry) => ({
      id: createId("kb"),
      question: entry.question,
      answer: entry.answer,
      category: entry.category,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const totalAudience = segments.reduce(
    (total, segment) => total + segment.estimatedUsers,
    0,
  );

  const deliveryLogs: MockDeliveryLog[] = announcements
    .filter((announcement) => announcement.status === "SENT" || announcement.status === "SENT_REAL")
    .slice(0, 6)
    .map((announcement, index) => {
      const segment = segments.find((item) => item.id === announcement.segmentId);
      const deliveredCount = segment?.estimatedUsers ?? totalAudience;

      return {
        id: createId("log"),
        announcementId: announcement.id,
        segmentId: announcement.segmentId,
        mode: index % 2 === 0 ? "DEMO" : "MANUAL",
        status: "SUCCESS",
        deliveredCount,
        details: `Enviado a ${new Intl.NumberFormat("es-CO").format(deliveredCount)} usuarios.`,
        createdAt: announcement.sentAt ?? announcement.scheduledAt,
      };
    });

  return {
    segments,
    announcements,
    knowledgeEntries,
    deliveryLogs,
  };
}

function getState() {
  if (!globalForMockStore.__rionegroMockStore) {
    globalForMockStore.__rionegroMockStore = initializeState();
  }

  return globalForMockStore.__rionegroMockStore;
}

function getSegmentById(segmentId: string | null) {
  if (!segmentId) {
    return null;
  }

  return getState().segments.find((segment) => segment.id === segmentId) ?? null;
}

function serializeAnnouncement(announcement: MockAnnouncement): AnnouncementSummary {
  const segment = getSegmentById(announcement.segmentId);

  return {
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    location: announcement.location,
    type: announcement.type,
    displayType: announcement.customTypeLabel ?? announcement.type,
    scheduledAt: announcement.scheduledAt.toISOString(),
    status: announcement.status,
    sentAt: announcement.sentAt?.toISOString() ?? null,
    createdAt: announcement.createdAt.toISOString(),
    segment: segment
      ? {
          id: segment.id,
          name: segment.name,
          estimatedUsers: segment.estimatedUsers,
        }
      : null,
  };
}

function serializeSegment(segment: MockSegment): SegmentSummary {
  const state = getState();
  const activeAnnouncements = state.announcements.filter(
    (announcement) => announcement.segmentId === segment.id,
  ).length;
  const lastUsedAt =
    state.deliveryLogs
      .filter((log) => log.segmentId === segment.id)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]
      ?.createdAt.toISOString() ?? null;

  return {
    id: segment.id,
    name: segment.name,
    description: segment.description,
    estimatedUsers: segment.estimatedUsers,
    recipientPhones: segment.recipientPhones,
    recipientCount: segment.recipientPhones.length,
    activeAnnouncements,
    lastUsedAt,
    createdAt: segment.createdAt.toISOString(),
  };
}

function serializeKnowledgeEntry(entry: MockKnowledgeEntry): KnowledgeEntrySummary {
  return {
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function serializeDeliveryLog(log: MockDeliveryLog): DeliveryLogSummary {
  const state = getState();
  const announcement = state.announcements.find((item) => item.id === log.announcementId);
  const segment = getSegmentById(log.segmentId);

  return {
    id: log.id,
    announcementId: log.announcementId,
    announcementTitle: announcement?.title ?? "Comunicado",
    segmentName: segment?.name ?? null,
    mode: log.mode,
    deliveredCount: log.deliveredCount,
    status: log.status,
    details: log.details,
    createdAt: log.createdAt.toISOString(),
  };
}

function getAnnouncementOrThrow(id: string) {
  const announcement = getState().announcements.find((item) => item.id === id);

  if (!announcement) {
    throw new AppError("El comunicado no existe.", 404);
  }

  return announcement;
}

function getKnowledgeEntryOrThrow(id: string) {
  const entry = getState().knowledgeEntries.find((item) => item.id === id);

  if (!entry) {
    throw new AppError("La entrada no existe.", 404);
  }

  return entry;
}

function getSegmentOrThrow(id: string) {
  const segment = getState().segments.find((item) => item.id === id);

  if (!segment) {
    throw new AppError("El segmento no existe.", 404);
  }

  return segment;
}

async function resolveAudience(segmentId: string | null) {
  if (segmentId) {
    const segment = getSegmentOrThrow(segmentId);

    return {
      id: segment.id,
      name: segment.name,
      estimatedUsers: segment.estimatedUsers,
      recipientPhones: segment.recipientPhones,
    };
  }

  const estimatedUsers = getState().segments.reduce(
    (total, segment) => total + segment.estimatedUsers,
    0,
  );

  return {
    id: null,
    name: "Cobertura general",
    estimatedUsers: estimatedUsers || DEFAULT_AUDIENCE_SIZE,
    recipientPhones: [],
  };
}

function createLog(
  input: Omit<MockDeliveryLog, "id" | "createdAt" | "status"> & {
    status?: "SUCCESS" | "FAILED";
  },
) {
  const state = getState();
  const log: MockDeliveryLog = {
    id: createId("log"),
    createdAt: new Date(),
    status: input.status ?? "SUCCESS",
    ...input,
  };

  state.deliveryLogs.unshift(log);
  return log;
}

export async function listAnnouncements(): Promise<AnnouncementSummary[]> {
  return [...getState().announcements]
    .sort((left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime())
    .map(serializeAnnouncement);
}

export async function createAnnouncement(input: AnnouncementInput) {
  const state = getState();
  const now = new Date();
  const resolvedType = resolveAnnouncementTypeInput(input.type);
  const announcement: MockAnnouncement = {
    id: createId("ann"),
    title: input.title,
    message: input.message,
    location: input.location,
    type: resolvedType.type,
    customTypeLabel: resolvedType.customTypeLabel,
    scheduledAt: parseScheduledDate(input.scheduledAt),
    status: "SCHEDULED",
    sentAt: null,
    segmentId: input.segmentId,
    createdAt: now,
    updatedAt: now,
  };

  state.announcements.unshift(announcement);
  return serializeAnnouncement(announcement);
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  const announcement = getAnnouncementOrThrow(id);
  const resolvedType = resolveAnnouncementTypeInput(input.type);

  announcement.title = input.title;
  announcement.message = input.message;
  announcement.location = input.location;
  announcement.type = resolvedType.type;
  announcement.customTypeLabel = resolvedType.customTypeLabel;
  announcement.scheduledAt = parseScheduledDate(input.scheduledAt);
  announcement.segmentId = input.segmentId;
  announcement.updatedAt = new Date();

  return serializeAnnouncement(announcement);
}

export async function deleteAnnouncement(id: string) {
  const state = getState();
  getAnnouncementOrThrow(id);
  state.announcements = state.announcements.filter((item) => item.id !== id);
  state.deliveryLogs = state.deliveryLogs.filter((log) => log.announcementId !== id);
  return { id };
}

export async function simulateAnnouncementSend(id: string) {
  const announcement = getAnnouncementOrThrow(id);
  const audience = await resolveAudience(announcement.segmentId);
  const result = await sendMessage({
    message: announcement.message,
    segment: audience,
    scheduledAt: announcement.scheduledAt,
    mode: "DEMO",
    to: audience.recipientPhones.join(","),
  });

  const log = createLog({
    announcementId: announcement.id,
    segmentId: audience.id,
    mode: "DEMO",
    deliveredCount: result.deliveredCount,
    details: result.log,
  });

  return {
    feedback: result.log,
    log: serializeDeliveryLog(log),
  };
}

export async function sendAnnouncementNow(
  id: string,
  mode: DeliveryMode = "MANUAL",
) {
  const announcement = getAnnouncementOrThrow(id);

  const audience = await resolveAudience(announcement.segmentId);
  const result = await sendMessage({
    message: announcement.message,
    segment: audience,
    scheduledAt: announcement.scheduledAt,
    mode,
    to: audience.recipientPhones.join(","),
  }).catch((error) => {
    const message =
      error instanceof Error ? error.message : "No se pudo enviar el comunicado.";
    announcement.status = "FAILED" as AnnouncementStatus;
    announcement.sentAt = null;
    announcement.updatedAt = new Date();
    createLog({
      announcementId: announcement.id,
      segmentId: audience.id,
      mode,
      status: "FAILED",
      deliveredCount: 0,
      details: message,
    });
    throw new AppError(message, 502);
  });

  const nextStatus = result.blockedBySafeMode
    ? "BLOCKED_BY_SAFE_MODE"
    : result.simulated
      ? "SENT_SIMULATED"
      : result.sent
        ? "SENT_REAL"
        : "FAILED";
  const details = result.blockedBySafeMode
    ? `[BLOCKED_BY_SAFE_MODE] ${result.log}`
    : result.simulated
      ? `[SENT_SIMULATED] ${result.log}`
      : `[SENT_REAL] ${result.log}`;

  announcement.status = nextStatus as AnnouncementStatus;
  announcement.sentAt = nextStatus === "SENT_REAL" ? new Date() : null;
  announcement.updatedAt = new Date();

  const log = createLog({
    announcementId: announcement.id,
    segmentId: audience.id,
    mode,
    status: result.blockedBySafeMode
      ? "FAILED"
      : result.sent || result.simulated
        ? "SUCCESS"
        : "FAILED",
    deliveredCount: result.deliveredCount,
    details,
  });

  return {
    feedback: result.log,
    announcement: serializeAnnouncement(announcement),
    log: serializeDeliveryLog(log),
  };
}

export async function listSegments(): Promise<SegmentSummary[]> {
  return [...getState().segments]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(serializeSegment);
}

export async function createSegment(input: SegmentInput) {
  const state = getState();
  const duplicate = state.segments.find(
    (segment) => segment.name.toLowerCase() === input.name.toLowerCase(),
  );

  if (duplicate) {
    throw new AppError("Ya existe un segmento con ese nombre.", 409);
  }

  const now = new Date();
  const segment: MockSegment = {
    id: createId("seg"),
    name: input.name,
    description: input.description,
    estimatedUsers: input.estimatedUsers,
    recipientPhones: input.recipientPhones,
    createdAt: now,
    updatedAt: now,
  };

  state.segments.push(segment);
  return serializeSegment(segment);
}

export async function updateSegment(id: string, input: SegmentInput) {
  const state = getState();
  const segment = getSegmentOrThrow(id);
  const duplicate = state.segments.find(
    (item) =>
      item.id !== id && item.name.toLowerCase() === input.name.toLowerCase(),
  );

  if (duplicate) {
    throw new AppError("Ya existe otro segmento con ese nombre.", 409);
  }

  segment.name = input.name;
  segment.description = input.description;
  segment.estimatedUsers = input.estimatedUsers;
  segment.recipientPhones = input.recipientPhones;
  segment.updatedAt = new Date();

  return serializeSegment(segment);
}

export async function deleteSegment(id: string) {
  const state = getState();
  getSegmentOrThrow(id);
  state.segments = state.segments.filter((item) => item.id !== id);

  for (const announcement of state.announcements) {
    if (announcement.segmentId === id) {
      announcement.segmentId = null;
      announcement.updatedAt = new Date();
    }
  }

  for (const log of state.deliveryLogs) {
    if (log.segmentId === id) {
      log.segmentId = null;
    }
  }

  return { id };
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntrySummary[]> {
  return [...getState().knowledgeEntries]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .map(serializeKnowledgeEntry);
}

export async function createKnowledgeEntry(input: KnowledgeInput) {
  const state = getState();
  const now = new Date();
  const entry: MockKnowledgeEntry = {
    id: createId("kb"),
    question: input.question,
    answer: input.answer,
    category: input.category,
    createdAt: now,
    updatedAt: now,
  };

  state.knowledgeEntries.unshift(entry);
  return serializeKnowledgeEntry(entry);
}

export async function updateKnowledgeEntry(id: string, input: KnowledgeInput) {
  const entry = getKnowledgeEntryOrThrow(id);

  entry.question = input.question;
  entry.answer = input.answer;
  entry.category = input.category;
  entry.updatedAt = new Date();

  return serializeKnowledgeEntry(entry);
}

export async function deleteKnowledgeEntry(id: string) {
  const state = getState();
  getKnowledgeEntryOrThrow(id);
  state.knowledgeEntries = state.knowledgeEntries.filter((item) => item.id !== id);
  return { id };
}

export async function getDashboardData(): Promise<DashboardData> {
  const state = getState();
  const scheduledAnnouncements = state.announcements.filter(
    (item) => item.status === "SCHEDULED",
  );

  return {
    stats: {
      users: state.segments.reduce((total, segment) => total + segment.estimatedUsers, 0),
      messages: state.deliveryLogs.length,
      activeAnnouncements: scheduledAnnouncements.length,
      segments: state.segments.length,
    },
    messageTrend: buildTrendFromLogs(state.deliveryLogs),
    typeBreakdown: buildTypeBreakdown(
      state.announcements.map((item) => ({
        type: item.type,
        customTypeLabel: item.customTypeLabel,
      })),
    ),
    upcomingAnnouncements: [...scheduledAnnouncements]
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())
      .slice(0, 4)
      .map(serializeAnnouncement),
    recentLogs: state.deliveryLogs.slice(0, 6).map(serializeDeliveryLog),
  };
}

export async function getSchedulerData(): Promise<SchedulerData> {
  const state = getState();

  return {
    scheduledAnnouncements: [...state.announcements]
      .filter((item) => item.status === "SCHEDULED")
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())
      .map(serializeAnnouncement),
    recentLogs: state.deliveryLogs.slice(0, 8).map(serializeDeliveryLog),
  };
}

export async function getMetricsData(): Promise<MetricsData> {
  const state = getState();
  const executedMessages = state.deliveryLogs.length;
  const deliveredUsers = state.deliveryLogs.reduce(
    (total, log) => total + log.deliveredCount,
    0,
  );
  const demoExecutions = state.deliveryLogs.filter((log) => log.mode === "DEMO").length;
  const mostUsedType =
    buildTypeBreakdown(
      state.announcements.map((item) => ({
        type: item.type,
        customTypeLabel: item.customTypeLabel,
      })),
    ).sort(
      (left, right) => right.value - left.value,
    )[0]?.label ?? "General";

  const segmentReachMap = new Map<string, number>();

  for (const log of state.deliveryLogs) {
    const label = getSegmentById(log.segmentId)?.name ?? "Cobertura general";
    segmentReachMap.set(label, (segmentReachMap.get(label) ?? 0) + log.deliveredCount);
  }

  return {
    totals: {
      executedMessages,
      deliveredUsers,
      demoExecutions,
      mostUsedType,
    },
    deliveryTrend: buildTrendFromLogs(state.deliveryLogs),
    typeUsage: buildTypeBreakdown(
      state.announcements.map((item) => ({
        type: item.type,
        customTypeLabel: item.customTypeLabel,
      })),
    ),
    segmentReach: Array.from(segmentReachMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value),
    recentDemoLogs: state.deliveryLogs
      .filter((log) => log.mode === "DEMO")
      .slice(0, 5)
      .map(serializeDeliveryLog),
  };
}

export async function processScheduledAnnouncements() {
  const state = getState();
  const dueAnnouncements = [...state.announcements]
    .filter(
      (announcement) =>
        announcement.status === "SCHEDULED" &&
        announcement.scheduledAt.getTime() <= Date.now(),
    )
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());

  const processed: DeliveryLogSummary[] = [];

  for (const announcement of dueAnnouncements) {
    try {
      const result = await sendAnnouncementNow(announcement.id, "SCHEDULED");
      processed.push(result.log);
    } catch (error) {
      const failedLog = createLog({
        announcementId: announcement.id,
        segmentId: announcement.segmentId,
        mode: "SCHEDULED",
        status: "FAILED",
        deliveredCount: 0,
        details: error instanceof Error ? error.message : "No se pudo enviar el comunicado programado.",
      });
      announcement.status = "FAILED" as AnnouncementStatus;
      announcement.sentAt = null;
      announcement.updatedAt = new Date();
      processed.push(serializeDeliveryLog(failedLog));
    }
  }

  return {
    processedCount: processed.filter((item) => item.status === "SUCCESS").length,
    processed,
  };
}
