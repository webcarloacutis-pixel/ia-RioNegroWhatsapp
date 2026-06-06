import { type AnnouncementStatus, type DeliveryMode } from "@prisma/client";
import { subDays } from "date-fns";

import {
  DEFAULT_ANNOUNCEMENT_TYPES,
  DEFAULT_AUDIENCE_SIZE,
  formatAnnouncementTypeLabel,
  normalizeAnnouncementType,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import {
  formatDateTimeForBogotaDisplay,
  parseBogotaDateTimeLocalToUtcDate,
} from "@/lib/format";
import {
  buildOfficialAnnouncements,
  buildOfficialKnowledgeEntries,
  officialSegments,
} from "@/lib/rionegro-content";
import type {
  AnnouncementSummary,
  DashboardData,
  DeliveryLogSummary,
  KnowledgeListResult,
  KnowledgeEntrySummary,
  KnowledgeTestAnswerResult,
  MetricsData,
  SchedulerData,
  SchedulerRunResult,
  SchedulerRunSummary,
  SchedulerStatus,
  SegmentSummary,
} from "@/lib/types";
import { getChannelRuntimeStatus } from "@/server/channel-status-service";
import { sendMessage } from "@/server/messageService";

type AnnouncementInput = {
  title: string;
  message: string;
  location: string | null;
  type: string;
  scheduledAt: string;
  segmentId: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  imageFilename?: string | null;
  imageMimeType?: string | null;
  imageSize?: number | null;
  imageProvider?: string | null;
  audioUrl?: string | null;
  audioPublicId?: string | null;
  audioFilename?: string | null;
  audioMimeType?: string | null;
  audioSize?: number | null;
  audioDuration?: number | null;
  audioProvider?: string | null;
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
  intent: string | null;
  shortAnswer: string | null;
  tags: string[];
  aliases: string[];
  sourceUrl: string | null;
  sourceName: string | null;
  sourceType: string;
  isOfficial: boolean;
  isActive: boolean;
  needsReview: boolean;
  confidence: number;
  lastVerifiedAt: Date | null;
};

type KnowledgeListFilters = {
  q?: string | null;
  category?: string | null;
  intent?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  isActive?: boolean | null;
  isOfficial?: boolean | null;
  needsReview?: boolean | null;
  lowConfidence?: boolean | null;
  tag?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

type KnowledgeBulkActionInput = {
  ids: string[];
  action: "activate" | "deactivate" | "markReviewed" | "changeCategory";
  category?: string;
};

type KnowledgeTestAnswerInput = {
  question: string;
  entryId?: string | null;
};

type ProcessScheduledOptions = {
  source?: "worker" | "admin" | "cron";
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
  imageUrl: string | null;
  imagePublicId: string | null;
  imageFilename: string | null;
  imageMimeType: string | null;
  imageSize: number | null;
  imageProvider: string | null;
  audioUrl: string | null;
  audioPublicId: string | null;
  audioFilename: string | null;
  audioMimeType: string | null;
  audioSize: number | null;
  audioDuration: number | null;
  audioProvider: string | null;
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
  intent: string | null;
  shortAnswer: string | null;
  tags: string[];
  aliases: string[];
  sourceUrl: string | null;
  sourceName: string | null;
  sourceType: string;
  isOfficial: boolean;
  isActive: boolean;
  needsReview: boolean;
  confidence: number;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockKnowledgeConflict = {
  id: string;
  topic: string;
  category: string | null;
  values: unknown;
  sourceUrls: string[];
  status: string;
  resolution: string | null;
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

type MockSchedulerRun = {
  id: string;
  source: string;
  startedAt: Date;
  completedAt: Date | null;
  dueCount: number;
  lockedCount: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  simulatedCount: number;
  skippedCount: number;
  details: string | null;
  createdAt: Date;
};

type MockState = {
  segments: MockSegment[];
  announcements: MockAnnouncement[];
  knowledgeEntries: MockKnowledgeEntry[];
  knowledgeConflicts: MockKnowledgeConflict[];
  deliveryLogs: MockDeliveryLog[];
  schedulerRuns: MockSchedulerRun[];
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

function buildAnnouncementImageData(input: AnnouncementInput) {
  return {
    imageUrl: input.imageUrl ?? null,
    imagePublicId: input.imagePublicId ?? null,
    imageFilename: input.imageFilename ?? null,
    imageMimeType: input.imageMimeType ?? null,
    imageSize: input.imageSize ?? null,
    imageProvider: input.imageProvider ?? null,
  };
}

function buildAnnouncementAudioData(input: AnnouncementInput) {
  return {
    audioUrl: input.audioUrl ?? null,
    audioPublicId: input.audioPublicId ?? null,
    audioFilename: input.audioFilename ?? null,
    audioMimeType: input.audioMimeType ?? null,
    audioSize: input.audioSize ?? null,
    audioDuration: input.audioDuration ?? null,
    audioProvider: input.audioProvider ?? null,
  };
}

function buildAnnouncementMediaPrefix(input: {
  imageUrl?: string | null;
  audioUrl?: string | null;
}) {
  const parts = [
    input.imageUrl ? "[IMAGE]" : "",
    input.audioUrl ? "[AUDIO]" : "",
  ].filter(Boolean);

  return parts.length ? `${parts.join("")} ` : "";
}

function isEnvTrue(value: string | undefined) {
  return value === "true";
}

function getSchedulerEnabled() {
  return process.env.SCHEDULER_ENABLED !== "false";
}

function getSchedulerIntervalSeconds() {
  const configured = Number(process.env.SCHEDULER_INTERVAL_SECONDS);

  return Number.isInteger(configured) && configured > 0 ? configured : 15;
}

function hasDefaultRecipient() {
  return Boolean(process.env.ULTRAMSG_DEFAULT_TO?.trim());
}

function isDryRunMode() {
  return (
    isEnvTrue(process.env.WHATSAPP_DRY_RUN) ||
    isEnvTrue(process.env.ULTRAMSG_MOCK) ||
    isEnvTrue(process.env.SIMULATION_MODE)
  );
}

function isSafeMode() {
  return isEnvTrue(process.env.WHATSAPP_SAFE_MODE);
}

function buildNoRecipientsMessage() {
  return "NO_RECIPIENTS: No se envio porque no hay destinatarios en el segmento ni ULTRAMSG_DEFAULT_TO.";
}

function serializeSchedulerRun(run: MockSchedulerRun | null): SchedulerRunSummary | null {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    source: run.source,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    dueCount: run.dueCount,
    lockedCount: run.lockedCount,
    processedCount: run.processedCount,
    sentCount: run.sentCount,
    failedCount: run.failedCount,
    blockedCount: run.blockedCount,
    simulatedCount: run.simulatedCount,
    skippedCount: run.skippedCount,
    details: run.details,
  };
}

function classifyDeliveryLog(log: DeliveryLogSummary) {
  const details = log.details ?? "";

  if (details.includes("[BLOCKED_BY_SAFE_MODE]")) {
    return "blocked" as const;
  }

  if (details.includes("[SENT_SIMULATED]")) {
    return "simulated" as const;
  }

  if (details.includes("[SENT_REAL]")) {
    return "sent" as const;
  }

  if (log.status === "FAILED") {
    return "failed" as const;
  }

  return "sent" as const;
}

function buildSchedulerRunResult(input: {
  source: string;
  startedAt: Date;
  completedAt: Date;
  dueCount: number;
  lockedCount: number;
  skippedCount: number;
  processed: DeliveryLogSummary[];
}): SchedulerRunResult {
  const result: SchedulerRunResult = {
    source: input.source,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    dueCount: input.dueCount,
    lockedCount: input.lockedCount,
    processedCount: input.processed.length,
    sentCount: 0,
    failedCount: 0,
    blockedCount: 0,
    simulatedCount: 0,
    skippedCount: input.skippedCount,
    processed: input.processed,
  };

  for (const log of input.processed) {
    const outcome = classifyDeliveryLog(log);

    if (outcome === "sent") {
      result.sentCount += 1;
    } else if (outcome === "simulated") {
      result.simulatedCount += 1;
    } else if (outcome === "blocked") {
      result.blockedCount += 1;
    } else {
      result.failedCount += 1;
    }
  }

  return result;
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
      imageUrl: null,
      imagePublicId: null,
      imageFilename: null,
      imageMimeType: null,
      imageSize: null,
      imageProvider: null,
      audioUrl: null,
      audioPublicId: null,
      audioFilename: null,
      audioMimeType: null,
      audioSize: null,
      audioDuration: null,
      audioProvider: null,
      status: item.status,
      sentAt: item.status === "SENT" || item.status === "SENT_REAL" ? scheduledAt : null,
      segmentId,
      createdAt: scheduledAt,
      updatedAt: scheduledAt,
    };
  });

  const knowledgeEntries: MockKnowledgeEntry[] = buildOfficialKnowledgeEntries().map(
    (entry, index) => ({
      id: createId("kb"),
      question: entry.question,
      answer: entry.answer,
      category: entry.category,
      intent: null,
      shortAnswer: entry.answer.length > 220 ? `${entry.answer.slice(0, 220)}...` : entry.answer,
      tags: [entry.category.toLowerCase()],
      aliases: index === 0 ? ["alcaldia", "palacio municipal"] : [],
      sourceUrl: "https://rionegro.gov.co/",
      sourceName: "Sitio oficial Alcaldia de Rionegro",
      sourceType: "derived_fallback",
      isOfficial: true,
      isActive: true,
      needsReview: index < 3,
      confidence: index < 3 ? 0.65 : 0.8,
      lastVerifiedAt: null,
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
    knowledgeConflicts: [],
    deliveryLogs,
    schedulerRuns: [],
  };
}

function getState() {
  if (!globalForMockStore.__rionegroMockStore) {
    globalForMockStore.__rionegroMockStore = initializeState();
  }

  return globalForMockStore.__rionegroMockStore;
}

export function resetMockStoreForTests() {
  globalForMockStore.__rionegroMockStore = {
    segments: [],
    announcements: [],
    knowledgeEntries: [],
    knowledgeConflicts: [],
    deliveryLogs: [],
    schedulerRuns: [],
  };
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
    imageUrl: announcement.imageUrl,
    imagePublicId: announcement.imagePublicId,
    imageFilename: announcement.imageFilename,
    imageMimeType: announcement.imageMimeType,
    imageSize: announcement.imageSize,
    imageProvider: announcement.imageProvider,
    audioUrl: announcement.audioUrl,
    audioPublicId: announcement.audioPublicId,
    audioFilename: announcement.audioFilename,
    audioMimeType: announcement.audioMimeType,
    audioSize: announcement.audioSize,
    audioDuration: announcement.audioDuration,
    audioProvider: announcement.audioProvider,
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
    lastVerifiedAt: entry.lastVerifiedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function serializeKnowledgeConflict(conflict: MockKnowledgeConflict) {
  return {
    id: conflict.id,
    topic: conflict.topic,
    category: conflict.category,
    values: conflict.values,
    sourceUrls: conflict.sourceUrls,
    status: conflict.status,
    resolution: conflict.resolution,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
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
    ...buildAnnouncementImageData(input),
    ...buildAnnouncementAudioData(input),
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
  Object.assign(announcement, buildAnnouncementImageData(input));
  Object.assign(announcement, buildAnnouncementAudioData(input));
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
    title: announcement.title,
    message: announcement.message,
    segment: audience,
    scheduledAt: announcement.scheduledAt,
    mode: "DEMO",
    to: audience.recipientPhones.join(","),
    imageUrl: announcement.imageUrl,
    imageFilename: announcement.imageFilename,
    imageMimeType: announcement.imageMimeType,
    imageSize: announcement.imageSize,
    audioUrl: announcement.audioUrl,
    audioFilename: announcement.audioFilename,
    audioMimeType: announcement.audioMimeType,
    audioSize: announcement.audioSize,
    audioDuration: announcement.audioDuration,
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

  if (!audience.recipientPhones.length && !hasDefaultRecipient() && mode !== "DEMO") {
    const message = buildNoRecipientsMessage();

    announcement.status = "FAILED" as AnnouncementStatus;
    announcement.sentAt = null;
    announcement.updatedAt = new Date();
    createLog({
      announcementId: announcement.id,
      segmentId: audience.id,
      mode,
      status: "FAILED",
      deliveredCount: 0,
      details: `${buildAnnouncementMediaPrefix(announcement)}${message}`,
    });
    throw new AppError(message, 502);
  }

  const result = await sendMessage({
    title: announcement.title,
    message: announcement.message,
    segment: audience,
    scheduledAt: announcement.scheduledAt,
    mode,
    to: audience.recipientPhones.join(","),
    imageUrl: announcement.imageUrl,
    imageFilename: announcement.imageFilename,
    imageMimeType: announcement.imageMimeType,
    imageSize: announcement.imageSize,
    audioUrl: announcement.audioUrl,
    audioFilename: announcement.audioFilename,
    audioMimeType: announcement.audioMimeType,
    audioSize: announcement.audioSize,
    audioDuration: announcement.audioDuration,
  }).catch((error) => {
    const message =
      error instanceof Error ? error.message : "No se pudo enviar el comunicado.";
    const details = `${buildAnnouncementMediaPrefix(announcement)}${
      /sin destinatarios/i.test(message) ? buildNoRecipientsMessage() : message
    }`;
    announcement.status = "FAILED" as AnnouncementStatus;
    announcement.sentAt = null;
    announcement.updatedAt = new Date();
    createLog({
      announcementId: announcement.id,
      segmentId: audience.id,
      mode,
      status: "FAILED",
      deliveredCount: 0,
      details,
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
    ? `[BLOCKED_BY_SAFE_MODE] ${buildAnnouncementMediaPrefix(announcement)}${result.log}`
    : result.simulated
      ? `[SENT_SIMULATED] ${buildAnnouncementMediaPrefix(announcement)}${result.log}`
      : `[SENT_REAL] ${buildAnnouncementMediaPrefix(announcement)}${result.log}`;

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

const LOW_CONFIDENCE_THRESHOLD = 0.7;

function normalizeKnowledgeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function knowledgeMatchesQuery(entry: MockKnowledgeEntry, query?: string | null) {
  const cleaned = query?.trim();

  if (!cleaned) {
    return true;
  }

  const normalizedQuery = normalizeKnowledgeText(cleaned);
  const text = normalizeKnowledgeText(
    [
      entry.question,
      entry.answer,
      entry.shortAnswer,
      entry.category,
      entry.intent,
      entry.sourceName,
      entry.sourceUrl,
      entry.sourceType,
      ...entry.tags,
      ...entry.aliases,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return text.includes(normalizedQuery);
}

function filterKnowledgeEntries(entries: MockKnowledgeEntry[], input: KnowledgeListFilters = {}) {
  return entries.filter((entry) => {
    if (!knowledgeMatchesQuery(entry, input.q)) return false;
    if (input.category && entry.category !== input.category) return false;
    if (input.intent && entry.intent !== input.intent) return false;
    if (input.sourceType && entry.sourceType !== input.sourceType) return false;
    if (input.sourceName && entry.sourceName !== input.sourceName) return false;
    if (input.tag && !entry.tags.includes(input.tag)) return false;
    if (typeof input.isActive === "boolean" && entry.isActive !== input.isActive) return false;
    if (typeof input.isOfficial === "boolean" && entry.isOfficial !== input.isOfficial) return false;
    if (typeof input.needsReview === "boolean" && entry.needsReview !== input.needsReview) {
      return false;
    }
    if (input.lowConfidence && entry.confidence >= LOW_CONFIDENCE_THRESHOLD) return false;

    return true;
  });
}

function buildMockFacet(entries: MockKnowledgeEntry[], getValue: (entry: MockKnowledgeEntry) => string | null) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const value = getValue(entry);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ label: value, value, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildMockTagFacet(entries: MockKnowledgeEntry[]) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ label: value, value, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 40);
}

function scoreKnowledgeItem(item: KnowledgeEntrySummary, query: string) {
  const normalizedQuery = normalizeKnowledgeText(query);
  const tokens = normalizedQuery.split(/\W+/).filter((token) => token.length >= 3);
  const haystack = normalizeKnowledgeText(
    [
      item.question,
      item.answer,
      item.shortAnswer,
      item.category,
      item.intent,
      item.sourceName,
      ...item.tags,
      ...item.aliases,
    ]
      .filter(Boolean)
      .join(" "),
  );

  let score = item.confidence * 20;

  if (haystack.includes(normalizedQuery)) score += 50;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 10;
  }
  if (item.isOfficial) score += 10;
  if (item.needsReview) score -= 10;
  if (!item.isActive) score -= 50;

  return Math.max(0, score);
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntrySummary[]> {
  return [...getState().knowledgeEntries]
    .filter((entry) => entry.isActive)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .map(serializeKnowledgeEntry);
}

export async function listKnowledgeDashboard(
  input: KnowledgeListFilters = {},
): Promise<KnowledgeListResult> {
  const state = getState();
  const page = Number.isInteger(input.page) && input.page && input.page > 0 ? input.page : 1;
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize && input.pageSize > 0
      ? Math.min(input.pageSize, 72)
      : 24;
  const filtered = filterKnowledgeEntries(state.knowledgeEntries, input).sort(
    (left, right) =>
      Number(right.needsReview) - Number(left.needsReview) ||
      right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
  const total = filtered.length;
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  const latest = [...state.knowledgeEntries].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  )[0];
  const sourceCount = new Set(
    state.knowledgeEntries.map((entry) => entry.sourceName).filter(Boolean),
  ).size;

  return {
    items: items.map(serializeKnowledgeEntry),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    facets: {
      categories: buildMockFacet(state.knowledgeEntries, (entry) => entry.category),
      intents: buildMockFacet(state.knowledgeEntries, (entry) => entry.intent),
      sources: buildMockFacet(state.knowledgeEntries, (entry) => entry.sourceName),
      tags: buildMockTagFacet(state.knowledgeEntries),
    },
    summary: {
      total: state.knowledgeEntries.length,
      active: state.knowledgeEntries.filter((entry) => entry.isActive).length,
      inactive: state.knowledgeEntries.filter((entry) => !entry.isActive).length,
      needsReview: state.knowledgeEntries.filter((entry) => entry.needsReview).length,
      official: state.knowledgeEntries.filter((entry) => entry.isOfficial).length,
      lowConfidence: state.knowledgeEntries.filter(
        (entry) => entry.confidence < LOW_CONFIDENCE_THRESHOLD,
      ).length,
      categories: new Set(state.knowledgeEntries.map((entry) => entry.category)).size,
      sources: sourceCount,
      lastUpdatedAt: latest?.updatedAt.toISOString() ?? null,
    },
    conflicts: state.knowledgeConflicts.map(serializeKnowledgeConflict),
    fallback: true,
  };
}

export async function getKnowledgeEntry(id: string) {
  return serializeKnowledgeEntry(getKnowledgeEntryOrThrow(id));
}

export async function createKnowledgeEntry(input: KnowledgeInput) {
  const state = getState();
  const now = new Date();
  const entry: MockKnowledgeEntry = {
    id: createId("kb"),
    question: input.question,
    answer: input.answer,
    category: input.category,
    intent: input.intent,
    shortAnswer: input.shortAnswer,
    tags: input.tags,
    aliases: input.aliases,
    sourceUrl: input.sourceUrl,
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    isOfficial: input.isOfficial,
    isActive: input.isActive,
    needsReview: input.needsReview,
    confidence: input.confidence,
    lastVerifiedAt: input.lastVerifiedAt,
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
  entry.intent = input.intent;
  entry.shortAnswer = input.shortAnswer;
  entry.tags = input.tags;
  entry.aliases = input.aliases;
  entry.sourceUrl = input.sourceUrl;
  entry.sourceName = input.sourceName;
  entry.sourceType = input.sourceType;
  entry.isOfficial = input.isOfficial;
  entry.isActive = input.isActive;
  entry.needsReview = input.needsReview;
  entry.confidence = input.confidence;
  entry.lastVerifiedAt = input.lastVerifiedAt;
  entry.updatedAt = new Date();

  return serializeKnowledgeEntry(entry);
}

export async function deleteKnowledgeEntry(id: string) {
  const state = getState();
  getKnowledgeEntryOrThrow(id);
  state.knowledgeEntries = state.knowledgeEntries.filter((item) => item.id !== id);
  return { id };
}

export async function toggleKnowledgeEntryActive(id: string) {
  const entry = getKnowledgeEntryOrThrow(id);
  entry.isActive = !entry.isActive;
  entry.updatedAt = new Date();
  return serializeKnowledgeEntry(entry);
}

export async function markKnowledgeEntryReviewed(id: string) {
  const entry = getKnowledgeEntryOrThrow(id);
  entry.needsReview = false;
  entry.lastVerifiedAt = new Date();
  entry.updatedAt = new Date();
  return serializeKnowledgeEntry(entry);
}

export async function bulkUpdateKnowledgeEntries(input: KnowledgeBulkActionInput) {
  const state = getState();
  const selected = state.knowledgeEntries.filter((entry) => input.ids.includes(entry.id));
  const now = new Date();

  if (input.action === "changeCategory" && !input.category) {
    throw new AppError("Selecciona la categoria nueva.", 400);
  }

  for (const entry of selected) {
    if (input.action === "activate") entry.isActive = true;
    if (input.action === "deactivate") entry.isActive = false;
    if (input.action === "markReviewed") {
      entry.needsReview = false;
      entry.lastVerifiedAt = now;
    }
    if (input.action === "changeCategory" && input.category) entry.category = input.category;
    entry.updatedAt = now;
  }

  return {
    updated: selected.length,
  };
}

export async function testKnowledgeAnswer(
  input: KnowledgeTestAnswerInput,
): Promise<KnowledgeTestAnswerResult> {
  const initialCandidates = input.entryId
    ? [serializeKnowledgeEntry(getKnowledgeEntryOrThrow(input.entryId))]
    : (
        await listKnowledgeDashboard({
          q: input.question,
          isActive: true,
          page: 1,
          pageSize: 5,
        })
      ).items;
  const candidateItems = initialCandidates.length
    ? initialCandidates
    : (
        await listKnowledgeDashboard({
          isActive: true,
          page: 1,
          pageSize: 24,
        })
      ).items;
  const rankedItems = candidateItems
    .map((item) => ({ item, score: scoreKnowledgeItem(item, input.question) }))
    .filter(({ score }) => score >= 20)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const best = rankedItems[0];

  if (!best) {
    return {
      answer: "No tengo informacion oficial sobre eso en este momento.",
      usedItems: [],
      confidence: 0.2,
      wouldSayUnknown: true,
    };
  }

  return {
    answer: best.item.shortAnswer || best.item.answer,
    usedItems: rankedItems.map(({ item }) => item),
    confidence: Math.min(1, Math.max(best.item.confidence, best.score / 100)),
    wouldSayUnknown: false,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const state = getState();
  const scheduledAnnouncements = state.announcements.filter(
    (item) => item.status === "SCHEDULED",
  );
  const segmentsWithRecipients = state.segments.filter(
    (segment) => segment.recipientPhones.length > 0,
  ).length;

  return {
    stats: {
      users: state.segments.reduce((total, segment) => total + segment.estimatedUsers, 0),
      messages: state.deliveryLogs.length,
      activeAnnouncements: scheduledAnnouncements.length,
      segments: state.segments.length,
    },
    channelStatus: getChannelRuntimeStatus({ segmentsWithRecipients }),
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
      .filter((item) => item.status === "SCHEDULED" || item.status === "SENDING")
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())
      .map(serializeAnnouncement),
    recentLogs: state.deliveryLogs.slice(0, 8).map(serializeDeliveryLog),
    status: await getSchedulerStatus(),
  };
}

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  const state = getState();
  const now = new Date();
  const lastRun =
    [...state.schedulerRuns].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0] ?? null;
  const runSummary = serializeSchedulerRun(lastRun);

  return {
    schedulerEnabled: getSchedulerEnabled(),
    workerExpected: getSchedulerEnabled(),
    intervalSeconds: getSchedulerIntervalSeconds(),
    lastRunAt: runSummary?.completedAt ?? runSummary?.startedAt ?? null,
    lastRun: runSummary,
    pendingScheduled: state.announcements.filter((item) => item.status === "SCHEDULED").length,
    overdueScheduled: state.announcements.filter(
      (item) => item.status === "SCHEDULED" && item.scheduledAt.getTime() <= now.getTime(),
    ).length,
    serverTimeUtc: now.toISOString(),
    serverTimeBogota: formatDateTimeForBogotaDisplay(now),
    safeMode: isSafeMode(),
    dryRun: isDryRunMode(),
    ultramsgMock: isEnvTrue(process.env.ULTRAMSG_MOCK),
    hasDefaultRecipient: hasDefaultRecipient(),
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

export async function processScheduledAnnouncements(
  options: ProcessScheduledOptions = {},
): Promise<SchedulerRunResult> {
  const state = getState();
  const source = options.source ?? "worker";
  const startedAt = new Date();
  const run: MockSchedulerRun = {
    id: createId("run"),
    source,
    startedAt,
    completedAt: null,
    dueCount: 0,
    lockedCount: 0,
    processedCount: 0,
    sentCount: 0,
    failedCount: 0,
    blockedCount: 0,
    simulatedCount: 0,
    skippedCount: 0,
    details: null,
    createdAt: startedAt,
  };

  state.schedulerRuns.unshift(run);

  console.log("[scheduler] tick", {
    source,
    startedAt: startedAt.toISOString(),
  });

  const dueAnnouncements = [...state.announcements]
    .filter(
      (announcement) =>
        announcement.status === "SCHEDULED" &&
        announcement.scheduledAt.getTime() <= startedAt.getTime(),
    )
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());

  console.log("[scheduler] due announcements found", {
    source,
    count: dueAnnouncements.length,
  });

  const processed: DeliveryLogSummary[] = [];
  let lockedCount = 0;
  let skippedCount = 0;

  for (const announcement of dueAnnouncements) {
    if (announcement.status !== "SCHEDULED") {
      skippedCount += 1;
      console.log("[scheduler] announcement skipped", {
        announcementId: announcement.id,
        reason: "lock_not_acquired",
      });
      continue;
    }

    announcement.status = "SENDING" as AnnouncementStatus;
    announcement.updatedAt = new Date();
    lockedCount += 1;

    console.log("[scheduler] announcement locked", {
      announcementId: announcement.id,
      title: announcement.title,
    });

    try {
      const audience = await resolveAudience(announcement.segmentId);

      console.log("[scheduler] recipients loaded", {
        announcementId: announcement.id,
        segment: audience.name,
        recipientPhones: audience.recipientPhones.length,
        hasDefaultRecipient: hasDefaultRecipient(),
      });

      if (!audience.recipientPhones.length && !hasDefaultRecipient()) {
        console.warn("[scheduler] no recipients", {
          announcementId: announcement.id,
          segment: audience.name,
        });

        announcement.status = "FAILED" as AnnouncementStatus;
        announcement.sentAt = null;
        announcement.updatedAt = new Date();

        const failedLog = createLog({
          announcementId: announcement.id,
          segmentId: audience.id,
          mode: "SCHEDULED",
          status: "FAILED",
          deliveredCount: 0,
          details: `${buildAnnouncementMediaPrefix(announcement)}${buildNoRecipientsMessage()}`,
        });
        processed.push(serializeDeliveryLog(failedLog));
        continue;
      }

      console.log("[scheduler] announcement sending", {
        announcementId: announcement.id,
        hasImage: Boolean(announcement.imageUrl),
        hasAudio: Boolean(announcement.audioUrl),
      });

      const result = await sendAnnouncementNow(announcement.id, "SCHEDULED");
      processed.push(result.log);

      const outcome = classifyDeliveryLog(result.log);

      if (outcome === "blocked") {
        console.warn("[scheduler] blocked by safe mode", {
          announcementId: announcement.id,
        });
      } else if (outcome === "simulated") {
        console.log("[scheduler] dry-run simulated", {
          announcementId: announcement.id,
        });
      } else if (outcome === "sent") {
        console.log("[scheduler] sent real", {
          announcementId: announcement.id,
        });
      }
    } catch (error) {
      const failedLog = createLog({
        announcementId: announcement.id,
        segmentId: announcement.segmentId,
        mode: "SCHEDULED",
        status: "FAILED",
        deliveredCount: 0,
        details:
          error instanceof Error && /sin destinatarios/i.test(error.message)
            ? buildNoRecipientsMessage()
            : error instanceof Error
              ? error.message
              : "No se pudo enviar el comunicado programado.",
      });
      announcement.status = "FAILED" as AnnouncementStatus;
      announcement.sentAt = null;
      announcement.updatedAt = new Date();
      processed.push(serializeDeliveryLog(failedLog));

      console.error("[scheduler] failed", {
        announcementId: announcement.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  const completedAt = new Date();
  const result = buildSchedulerRunResult({
    source,
    startedAt,
    completedAt,
    dueCount: dueAnnouncements.length,
    lockedCount,
    skippedCount,
    processed,
  });

  Object.assign(run, {
    completedAt,
    dueCount: result.dueCount,
    lockedCount: result.lockedCount,
    processedCount: result.processedCount,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    blockedCount: result.blockedCount,
    simulatedCount: result.simulatedCount,
    skippedCount: result.skippedCount,
    details: JSON.stringify({
      processedLogIds: processed.map((log) => log.id),
    }),
  });

  console.log("[scheduler] completed", {
    source,
    dueCount: result.dueCount,
    lockedCount: result.lockedCount,
    processedCount: result.processedCount,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    blockedCount: result.blockedCount,
    simulatedCount: result.simulatedCount,
    skippedCount: result.skippedCount,
  });

  return result;
}
