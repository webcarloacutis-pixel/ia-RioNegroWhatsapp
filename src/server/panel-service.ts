import {
  AnnouncementStatus,
  AnnouncementType,
  DeliveryMode,
  DeliveryStatus,
  type Prisma,
} from "@prisma/client";
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
import { classifyPrismaError, logger, sanitizeError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
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
import * as mockStore from "@/server/mock-store";
import {
  serializeAnnouncement,
  serializeDeliveryLog,
  serializeKnowledgeConflict,
  serializeKnowledgeEntry,
  serializeSegment,
} from "@/server/serializers";
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

type DeliveryLoggedError = AppError & {
  deliveryLog?: DeliveryLogSummary;
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

export type KnowledgeListFilters = {
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

let fallbackWarningShown = false;

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

function getDefaultRecipient() {
  return process.env.ULTRAMSG_DEFAULT_TO?.trim() ?? "";
}

function hasDefaultRecipient() {
  return Boolean(getDefaultRecipient());
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

function getServerClockStatus(now = new Date()) {
  return {
    serverTimeUtc: now.toISOString(),
    serverTimeBogota: formatDateTimeForBogotaDisplay(now),
  };
}

function buildNoRecipientsMessage() {
  return "NO_RECIPIENTS: No se envio porque no hay destinatarios en el segmento ni ULTRAMSG_DEFAULT_TO.";
}

function buildSchedulerRunSummary(
  run: {
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
  } | null,
): SchedulerRunSummary | null {
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

function parseScheduledDate(value: string) {
  const date = parseBogotaDateTimeLocalToUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("La fecha programada no es valida.");
  }

  return date;
}

function getSendResultStatus(result: Awaited<ReturnType<typeof sendMessage>>) {
  if (result.blockedBySafeMode) {
    return AnnouncementStatus.BLOCKED_BY_SAFE_MODE;
  }

  if (result.simulated) {
    return AnnouncementStatus.SENT_SIMULATED;
  }

  if (result.sent) {
    return AnnouncementStatus.SENT_REAL;
  }

  return AnnouncementStatus.FAILED;
}

function getDeliveryStatusForResult(result: Awaited<ReturnType<typeof sendMessage>>) {
  if (result.blockedBySafeMode) {
    return DeliveryStatus.FAILED;
  }

  return result.sent || result.simulated ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED;
}

function isDeliveryLoggedError(error: unknown): error is DeliveryLoggedError {
  return error instanceof AppError && Boolean((error as DeliveryLoggedError).deliveryLog);
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

function buildTypeBreakdown(
  announcementTypes: Array<{
    type: string;
    customTypeLabel: string | null;
  }>,
) {
  const usageMap = new Map<string, number>();

  for (const item of announcementTypes) {
    const label = item.customTypeLabel ?? item.type;
    const normalized = normalizeAnnouncementType(label);
    usageMap.set(normalized, (usageMap.get(normalized) ?? 0) + 1);
  }

  const orderedTypes = Array.from(
    new Set([
      ...DEFAULT_ANNOUNCEMENT_TYPES,
      ...announcementTypes.map((item) => normalizeAnnouncementType(item.customTypeLabel ?? item.type)),
    ]),
  );

  return orderedTypes.map((type) => ({
    label: formatAnnouncementTypeLabel(type),
    value: usageMap.get(type) ?? 0,
  }));
}

function resolveAnnouncementTypeInput(value: string) {
  const normalized = normalizeAnnouncementType(value);

  if ((DEFAULT_ANNOUNCEMENT_TYPES as readonly string[]).includes(normalized)) {
    return {
      type: normalized as AnnouncementType,
      customTypeLabel: null as string | null,
    };
  }

  return {
    type: AnnouncementType.GENERAL,
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

function isDatabaseUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  const prismaRecoverableCodes = new Set([
    "P1000",
    "P1001",
    "P1002",
    "P1008",
    "P1010",
    "P1011",
    "P1012",
    "P1017",
    "P2021",
    "P2022",
    "P2024",
  ]);
  const message = error.message;

  return (
    error.name === "PrismaClientInitializationError" ||
    Boolean(errorWithCode.code && prismaRecoverableCodes.has(errorWithCode.code)) ||
    message.includes("Authentication failed against database server") ||
    message.includes("Can't reach database server") ||
    message.includes("Server has closed the connection") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("Error querying the database") ||
    message.includes("does not exist") ||
    message.includes("The table") ||
    message.includes("relation") ||
    message.includes("Environment variable not found") ||
    message.includes("PrismaClientInitializationError") ||
    message.includes("PrismaClientKnownRequestError") ||
    message.includes("Invalid `prisma.")
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
      logger.warn(
        "panel-service",
        "PostgreSQL no esta disponible. Se activa el modo demo en memoria para que el panel siga funcionando.",
      );
      fallbackWarningShown = true;
    }

    logger.warn("dashboard", "using fallback demo data", {
      reason: classifyPrismaError(error),
      error: sanitizeError(error),
    });

    return runWithMock();
  }
}

async function resolveAudience(segmentId: string | null) {
  if (segmentId) {
    const segment = await prisma.segment.findUnique({
      where: { id: segmentId },
      select: {
        id: true,
        name: true,
        estimatedUsers: true,
        recipientPhones: true,
      },
    });

    if (!segment) {
      throw new AppError("El segmento seleccionado no existe.", 404);
    }

    return segment;
  }

  const audience = await prisma.segment.aggregate({
    _sum: {
      estimatedUsers: true,
    },
  });

  return {
    id: null,
    name: "Cobertura general",
    estimatedUsers: audience._sum.estimatedUsers ?? DEFAULT_AUDIENCE_SIZE,
    recipientPhones: [],
  };
}

async function getAnnouncementOrThrow(id: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: {
      segment: {
        select: {
          id: true,
          name: true,
          estimatedUsers: true,
        },
      },
    },
  });

  if (!announcement) {
    throw new AppError("El comunicado no existe.", 404);
  }

  return announcement;
}

async function getRecentLogs(limit = 6): Promise<DeliveryLogSummary[]> {
  const logs = await prisma.deliveryLog.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    include: {
      announcement: {
        select: {
          id: true,
          title: true,
        },
      },
      segment: {
        select: {
          name: true,
        },
      },
    },
  });

  return logs.map(serializeDeliveryLog);
}

async function listAnnouncementsDb(): Promise<AnnouncementSummary[]> {
  const announcements = await prisma.announcement.findMany({
    orderBy: {
      scheduledAt: "desc",
    },
    include: {
      segment: {
        select: {
          id: true,
          name: true,
          estimatedUsers: true,
        },
      },
    },
  });

  return announcements.map(serializeAnnouncement);
}

async function createAnnouncementDb(input: AnnouncementInput) {
  const scheduledAt = parseScheduledDate(input.scheduledAt);

  console.log("[announcements] create requested", {
    type: input.type,
    hasSegment: Boolean(input.segmentId),
  });
  console.log("[announcements] scheduledAt utc", {
    scheduledAt: scheduledAt.toISOString(),
  });
  console.log("[announcements] scheduledAt bogota", {
    scheduledAt: formatDateTimeForBogotaDisplay(scheduledAt),
  });

  const resolvedType = resolveAnnouncementTypeInput(input.type);
  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      message: input.message,
      location: input.location,
      type: resolvedType.type,
      customTypeLabel: resolvedType.customTypeLabel,
      scheduledAt,
      segmentId: input.segmentId,
      ...buildAnnouncementImageData(input),
      ...buildAnnouncementAudioData(input),
    },
    include: {
      segment: {
        select: {
          id: true,
          name: true,
          estimatedUsers: true,
        },
      },
    },
  });

  console.log("[announcements] created", {
    id: announcement.id,
    status: announcement.status,
    scheduledAt: announcement.scheduledAt.toISOString(),
  });

  return serializeAnnouncement(announcement);
}

async function updateAnnouncementDb(id: string, input: AnnouncementInput) {
  await getAnnouncementOrThrow(id);
  const resolvedType = resolveAnnouncementTypeInput(input.type);
  const scheduledAt = parseScheduledDate(input.scheduledAt);

  console.log("[announcements] scheduledAt utc", {
    id,
    scheduledAt: scheduledAt.toISOString(),
  });
  console.log("[announcements] scheduledAt bogota", {
    id,
    scheduledAt: formatDateTimeForBogotaDisplay(scheduledAt),
  });

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      title: input.title,
      message: input.message,
      location: input.location,
      type: resolvedType.type,
      customTypeLabel: resolvedType.customTypeLabel,
      scheduledAt,
      segmentId: input.segmentId,
      ...buildAnnouncementImageData(input),
      ...buildAnnouncementAudioData(input),
    },
    include: {
      segment: {
        select: {
          id: true,
          name: true,
          estimatedUsers: true,
        },
      },
    },
  });

  return serializeAnnouncement(announcement);
}

async function deleteAnnouncementDb(id: string) {
  await getAnnouncementOrThrow(id);
  await prisma.announcement.delete({ where: { id } });
  return { id };
}

async function simulateAnnouncementSendDb(id: string) {
  const announcement = await getAnnouncementOrThrow(id);
  const audience = await resolveAudience(announcement.segmentId);

  console.log("[announcements] send requested", {
    id,
    mode: "DEMO",
  });
  console.log("[announcements] recipients loaded", {
    id,
    segment: audience.name,
    estimatedUsers: audience.estimatedUsers,
    recipientPhones: audience.recipientPhones.length,
  });
  console.log("[announcements] dry-run mode", {
    id,
    mode: "DEMO",
  });

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

  const log = await prisma.deliveryLog.create({
    data: {
      announcementId: announcement.id,
      segmentId: audience.id,
      mode: DeliveryMode.DEMO,
      deliveredCount: result.deliveredCount,
      details: result.log,
    },
    include: {
      announcement: {
        select: {
          id: true,
          title: true,
        },
      },
      segment: {
        select: {
          name: true,
        },
      },
    },
  });

  console.log("[announcements] sent", {
    id,
    mode: "DEMO",
    deliveredCount: result.deliveredCount,
  });

  return {
    feedback: result.log,
    log: serializeDeliveryLog(log),
  };
}

async function markAnnouncementFailedWithLogDb(input: {
  announcementId: string;
  segmentId: string | null;
  mode: DeliveryMode;
  details: string;
}) {
  const [, log] = await prisma.$transaction([
    prisma.announcement.update({
      where: { id: input.announcementId },
      data: {
        status: AnnouncementStatus.FAILED,
        sentAt: null,
      },
    }),
    prisma.deliveryLog.create({
      data: {
        announcementId: input.announcementId,
        segmentId: input.segmentId,
        mode: input.mode,
        status: DeliveryStatus.FAILED,
        deliveredCount: 0,
        details: input.details,
      },
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
          },
        },
        segment: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return serializeDeliveryLog(log);
}

async function sendAnnouncementNowDb(
  id: string,
  mode: DeliveryMode = DeliveryMode.MANUAL,
) {
  const announcement = await getAnnouncementOrThrow(id);

  console.log("[announcements] send requested", {
    id,
    mode,
  });

  const audience = await resolveAudience(announcement.segmentId);

  console.log("[announcements] recipients loaded", {
    id,
    segment: audience.name,
    estimatedUsers: audience.estimatedUsers,
    recipientPhones: audience.recipientPhones.length,
  });

  if (!audience.recipientPhones.length && !hasDefaultRecipient()) {
    const message = buildNoRecipientsMessage();

    console.warn("[announcements] no recipients", {
      id,
      segment: audience.name,
    });

    const log = await markAnnouncementFailedWithLogDb({
      announcementId: announcement.id,
      segmentId: audience.id,
      mode,
      details: `${buildAnnouncementMediaPrefix(announcement)}${message}`,
    });
    const loggedError = new AppError(message, 502) as DeliveryLoggedError;
    loggedError.deliveryLog = log;
    throw loggedError;
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
  }).catch(async (error) => {
    const message =
      error instanceof Error ? error.message : "No se pudo enviar el comunicado.";
    const details = `${buildAnnouncementMediaPrefix(announcement)}${
      /sin destinatarios/i.test(message) ? buildNoRecipientsMessage() : message
    }`;

    console.error("[announcements] failed", {
      id,
      mode,
      error: message,
    });

    const log = await markAnnouncementFailedWithLogDb({
      announcementId: announcement.id,
      segmentId: audience.id,
      mode,
      details,
    });
    const loggedError = new AppError(message, 502) as DeliveryLoggedError;
    loggedError.deliveryLog = log;
    throw loggedError;
  });

  const nextStatus = getSendResultStatus(result);
  const deliveryStatus = getDeliveryStatusForResult(result);
  const isRealSend = nextStatus === AnnouncementStatus.SENT_REAL;
  const mediaPrefix = buildAnnouncementMediaPrefix(announcement);
  const details =
    result.blockedBySafeMode
      ? `[BLOCKED_BY_SAFE_MODE] ${mediaPrefix}${result.log}`
      : result.simulated
        ? `[SENT_SIMULATED] ${mediaPrefix}${result.log}`
        : `[SENT_REAL] ${mediaPrefix}${result.log}`;

  const [updatedAnnouncement, log] = await prisma.$transaction([
    prisma.announcement.update({
      where: { id: announcement.id },
      data: {
        status: nextStatus,
        sentAt: isRealSend ? new Date() : null,
      },
      include: {
        segment: {
          select: {
            id: true,
            name: true,
            estimatedUsers: true,
          },
        },
      },
    }),
    prisma.deliveryLog.create({
      data: {
        announcementId: announcement.id,
        segmentId: audience.id,
        mode,
        status: deliveryStatus,
        deliveredCount: result.deliveredCount,
        details,
      },
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
          },
        },
        segment: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  console.log("[announcements] sent", {
    id,
    mode,
    status: nextStatus,
    deliveredCount: result.deliveredCount,
  });

  if (nextStatus === AnnouncementStatus.SENT_REAL) {
    console.log("[announcements] sent real", {
      id,
      mode,
      deliveredCount: result.deliveredCount,
    });
  }

  return {
    feedback: result.log,
    announcement: serializeAnnouncement(updatedAnnouncement),
    log: serializeDeliveryLog(log),
  };
}

async function listSegmentsDb(): Promise<SegmentSummary[]> {
  const segments = await prisma.segment.findMany({
    orderBy: {
      name: "asc",
    },
    include: {
      _count: {
        select: {
          announcements: true,
        },
      },
      deliveryLogs: {
        select: {
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  return segments.map(serializeSegment);
}

async function createSegmentDb(input: SegmentInput) {
  const exists = await prisma.segment.findUnique({
    where: { name: input.name },
  });

  if (exists) {
    throw new AppError("Ya existe un segmento con ese nombre.", 409);
  }

  const segment = await prisma.segment.create({
    data: {
      name: input.name,
      description: input.description,
      estimatedUsers: input.estimatedUsers,
      recipientPhones: input.recipientPhones,
    },
    include: {
      _count: {
        select: {
          announcements: true,
        },
      },
      deliveryLogs: {
        select: {
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  return serializeSegment(segment);
}

async function updateSegmentDb(id: string, input: SegmentInput) {
  const current = await prisma.segment.findUnique({
    where: { id },
  });

  if (!current) {
    throw new AppError("El segmento no existe.", 404);
  }

  const duplicate = await prisma.segment.findFirst({
    where: {
      name: input.name,
      NOT: { id },
    },
  });

  if (duplicate) {
    throw new AppError("Ya existe otro segmento con ese nombre.", 409);
  }

  const segment = await prisma.segment.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      estimatedUsers: input.estimatedUsers,
      recipientPhones: input.recipientPhones,
    },
    include: {
      _count: {
        select: {
          announcements: true,
        },
      },
      deliveryLogs: {
        select: {
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  return serializeSegment(segment);
}

async function deleteSegmentDb(id: string) {
  const segment = await prisma.segment.findUnique({
    where: { id },
  });

  if (!segment) {
    throw new AppError("El segmento no existe.", 404);
  }

  await prisma.segment.delete({ where: { id } });
  return { id };
}

const KNOWLEDGE_DEFAULT_PAGE_SIZE = 24;
const KNOWLEDGE_MAX_PAGE_SIZE = 72;
const LOW_CONFIDENCE_THRESHOLD = 0.7;

function normalizeKnowledgePage(value?: number | null) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function normalizeKnowledgePageSize(value?: number | null) {
  if (!Number.isInteger(value) || !value || value <= 0) {
    return KNOWLEDGE_DEFAULT_PAGE_SIZE;
  }

  return Math.min(value, KNOWLEDGE_MAX_PAGE_SIZE);
}

function cleanFilter(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function buildKnowledgeWhere(input: KnowledgeListFilters = {}) {
  const where: Prisma.KnowledgeBaseEntryWhereInput = {};
  const q = cleanFilter(input.q);
  const category = cleanFilter(input.category);
  const intent = cleanFilter(input.intent);
  const sourceType = cleanFilter(input.sourceType);
  const sourceName = cleanFilter(input.sourceName);
  const tag = cleanFilter(input.tag);

  if (category) where.category = category;
  if (intent) where.intent = intent;
  if (sourceType) where.sourceType = sourceType;
  if (sourceName) where.sourceName = sourceName;
  if (typeof input.isActive === "boolean") where.isActive = input.isActive;
  if (typeof input.isOfficial === "boolean") where.isOfficial = input.isOfficial;
  if (typeof input.needsReview === "boolean") where.needsReview = input.needsReview;
  if (input.lowConfidence) where.confidence = { lt: LOW_CONFIDENCE_THRESHOLD };
  if (tag) where.tags = { has: tag };

  if (q) {
    where.OR = [
      { question: { contains: q, mode: "insensitive" } },
      { answer: { contains: q, mode: "insensitive" } },
      { shortAnswer: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { intent: { contains: q, mode: "insensitive" } },
      { sourceName: { contains: q, mode: "insensitive" } },
      { sourceUrl: { contains: q, mode: "insensitive" } },
      { sourceType: { contains: q, mode: "insensitive" } },
      { tags: { has: q } },
      { aliases: { has: q } },
    ];
  }

  return where;
}

function buildFacetFromGroups<T extends { _count: { _all: number } }>(
  groups: T[],
  key: keyof T & string,
) {
  return groups
    .map((item) => {
      const value = item[key] as string | null | undefined;

      return value
        ? {
            label: value,
            value,
            count: item._count._all,
          }
        : null;
    })
    .filter((item): item is { label: string; value: string; count: number } =>
      Boolean(item),
    )
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildTagFacets(entries: Array<{ tags: string[] }>) {
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

async function getKnowledgeDashboardSummaryDb(): Promise<KnowledgeListResult["summary"]> {
  const [
    total,
    active,
    needsReview,
    official,
    lowConfidence,
    categories,
    sources,
    latest,
  ] = await Promise.all([
    prisma.knowledgeBaseEntry.count(),
    prisma.knowledgeBaseEntry.count({ where: { isActive: true } }),
    prisma.knowledgeBaseEntry.count({ where: { needsReview: true } }),
    prisma.knowledgeBaseEntry.count({ where: { isOfficial: true } }),
    prisma.knowledgeBaseEntry.count({
      where: { confidence: { lt: LOW_CONFIDENCE_THRESHOLD } },
    }),
    prisma.knowledgeBaseEntry.groupBy({
      by: ["category"],
      _count: { _all: true },
    }),
    prisma.knowledgeBaseEntry.groupBy({
      by: ["sourceName"],
      where: { sourceName: { not: null } },
      _count: { _all: true },
    }),
    prisma.knowledgeBaseEntry.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return {
    total,
    active,
    inactive: total - active,
    needsReview,
    official,
    lowConfidence,
    categories: categories.length,
    sources: sources.length,
    lastUpdatedAt: latest?.updatedAt.toISOString() ?? null,
  };
}

async function getKnowledgeFacetsDb(): Promise<KnowledgeListResult["facets"]> {
  const [categories, intents, sources, tagEntries] = await Promise.all([
    prisma.knowledgeBaseEntry.groupBy({
      by: ["category"],
      _count: { _all: true },
    }),
    prisma.knowledgeBaseEntry.groupBy({
      by: ["intent"],
      where: { intent: { not: null } },
      _count: { _all: true },
    }),
    prisma.knowledgeBaseEntry.groupBy({
      by: ["sourceName"],
      where: { sourceName: { not: null } },
      _count: { _all: true },
    }),
    prisma.knowledgeBaseEntry.findMany({
      select: { tags: true },
      take: 1000,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    categories: buildFacetFromGroups(categories, "category"),
    intents: buildFacetFromGroups(intents, "intent"),
    sources: buildFacetFromGroups(sources, "sourceName"),
    tags: buildTagFacets(tagEntries),
  };
}

async function listKnowledgeConflictsDb() {
  const conflicts = await prisma.knowledgeConflict.findMany({
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return conflicts.map(serializeKnowledgeConflict);
}

async function listKnowledgeEntriesDb(): Promise<KnowledgeEntrySummary[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return entries.map(serializeKnowledgeEntry);
}

async function listKnowledgeDashboardDb(
  input: KnowledgeListFilters = {},
): Promise<KnowledgeListResult> {
  const page = normalizeKnowledgePage(input.page);
  const pageSize = normalizeKnowledgePageSize(input.pageSize);
  const where = buildKnowledgeWhere(input);

  logger.info("knowledge", "prisma query started", {
    page,
    pageSize,
    hasSearch: Boolean(input.q?.trim()),
    category: input.category,
    intent: input.intent,
    isActive: input.isActive,
    needsReview: input.needsReview,
  });

  try {
    const [items, total, facets, summary, conflicts] = await Promise.all([
      prisma.knowledgeBaseEntry.findMany({
        where,
        orderBy: [{ needsReview: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.knowledgeBaseEntry.count({ where }),
      getKnowledgeFacetsDb(),
      getKnowledgeDashboardSummaryDb(),
      listKnowledgeConflictsDb(),
    ]);

    logger.info("knowledge", "prisma query success", {
      page,
      pageSize,
      returned: items.length,
      total,
      fallback: false,
    });

    return {
      items: items.map(serializeKnowledgeEntry),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      facets,
      summary,
      conflicts,
      fallback: false,
    };
  } catch (error) {
    logger.error("knowledge", "prisma query failed", {
      classification: classifyPrismaError(error),
      error: sanitizeError(error),
    });
    throw error;
  }
}

async function getKnowledgeEntryDb(id: string) {
  const entry = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    throw new AppError("La entrada no existe.", 404);
  }

  return serializeKnowledgeEntry(entry);
}

async function createKnowledgeEntryDb(input: KnowledgeInput) {
  const entry = await prisma.knowledgeBaseEntry.create({
    data: input,
  });

  return serializeKnowledgeEntry(entry);
}

async function updateKnowledgeEntryDb(id: string, input: KnowledgeInput) {
  const exists = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
  });

  if (!exists) {
    throw new AppError("La entrada no existe.", 404);
  }

  const entry = await prisma.knowledgeBaseEntry.update({
    where: { id },
    data: input,
  });

  return serializeKnowledgeEntry(entry);
}

async function deleteKnowledgeEntryDb(id: string) {
  const exists = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
  });

  if (!exists) {
    throw new AppError("La entrada no existe.", 404);
  }

  await prisma.knowledgeBaseEntry.delete({
    where: { id },
  });

  return { id };
}

async function toggleKnowledgeEntryActiveDb(id: string) {
  const entry = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    throw new AppError("La entrada no existe.", 404);
  }

  const updated = await prisma.knowledgeBaseEntry.update({
    where: { id },
    data: {
      isActive: !entry.isActive,
    },
  });

  return serializeKnowledgeEntry(updated);
}

async function markKnowledgeEntryReviewedDb(id: string) {
  const exists = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
  });

  if (!exists) {
    throw new AppError("La entrada no existe.", 404);
  }

  const updated = await prisma.knowledgeBaseEntry.update({
    where: { id },
    data: {
      needsReview: false,
      lastVerifiedAt: new Date(),
    },
  });

  return serializeKnowledgeEntry(updated);
}

async function bulkUpdateKnowledgeEntriesDb(input: KnowledgeBulkActionInput) {
  const data: Prisma.KnowledgeBaseEntryUpdateManyMutationInput =
    input.action === "activate"
      ? { isActive: true }
      : input.action === "deactivate"
        ? { isActive: false }
        : input.action === "markReviewed"
          ? { needsReview: false, lastVerifiedAt: new Date() }
          : { category: input.category };

  if (input.action === "changeCategory" && !input.category) {
    throw new AppError("Selecciona la categoria nueva.", 400);
  }

  const result = await prisma.knowledgeBaseEntry.updateMany({
    where: {
      id: {
        in: input.ids,
      },
    },
    data,
  });

  return {
    updated: result.count,
  };
}

function normalizeKnowledgeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

  if (haystack.includes(normalizedQuery)) {
    score += 50;
  }

  for (const token of tokens) {
    if (haystack.includes(token)) score += 10;
  }

  if (item.isOfficial) score += 10;
  if (item.needsReview) score -= 10;
  if (!item.isActive) score -= 50;

  return Math.max(0, score);
}

async function testKnowledgeAnswerDb(
  input: KnowledgeTestAnswerInput,
): Promise<KnowledgeTestAnswerResult> {
  const initialCandidates = input.entryId
    ? [await getKnowledgeEntryDb(input.entryId)]
    : (
        await listKnowledgeDashboardDb({
          q: input.question,
          isActive: true,
          page: 1,
          pageSize: 5,
        })
      ).items;
  const candidateItems = initialCandidates.length
    ? initialCandidates
    : (
        await listKnowledgeDashboardDb({
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

async function getDashboardDataDb(): Promise<DashboardData> {
  const [
    segmentStats,
    totalLogs,
    activeAnnouncementsCount,
    upcoming,
    typeUsage,
    recentLogs,
    trendLogs,
    segmentsWithRecipients,
  ] = await Promise.all([
    prisma.segment.aggregate({
      _sum: {
        estimatedUsers: true,
      },
      _count: true,
    }),
    prisma.deliveryLog.count(),
    prisma.announcement.count({
      where: {
        status: AnnouncementStatus.SCHEDULED,
      },
    }),
    prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.SCHEDULED,
      },
      orderBy: {
        scheduledAt: "asc",
      },
      take: 4,
      include: {
        segment: {
          select: {
            id: true,
            name: true,
            estimatedUsers: true,
          },
        },
      },
    }),
    prisma.announcement.findMany({
      select: {
        type: true,
        customTypeLabel: true,
      },
    }),
    getRecentLogs(6),
    prisma.deliveryLog.findMany({
      where: {
        createdAt: {
          gte: subDays(new Date(), 6),
        },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.segment.count({
      where: {
        recipientPhones: {
          isEmpty: false,
        },
      },
    }),
  ]);

  return {
    stats: {
      users: segmentStats._sum.estimatedUsers ?? DEFAULT_AUDIENCE_SIZE,
      messages: totalLogs,
      activeAnnouncements: activeAnnouncementsCount,
      segments: segmentStats._count,
    },
    channelStatus: getChannelRuntimeStatus({ segmentsWithRecipients }),
    messageTrend: buildTrendFromLogs(trendLogs),
    typeBreakdown: buildTypeBreakdown(typeUsage),
    upcomingAnnouncements: upcoming.map(serializeAnnouncement),
    recentLogs,
  };
}

async function getSchedulerStatusDb(): Promise<SchedulerStatus> {
  const now = new Date();
  const [pendingScheduled, overdueScheduled, lastRun] = await Promise.all([
    prisma.announcement.count({
      where: {
        status: AnnouncementStatus.SCHEDULED,
      },
    }),
    prisma.announcement.count({
      where: {
        status: AnnouncementStatus.SCHEDULED,
        scheduledAt: {
          lte: now,
        },
      },
    }),
    prisma.schedulerRun.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);
  const runSummary = buildSchedulerRunSummary(lastRun);

  return {
    schedulerEnabled: getSchedulerEnabled(),
    workerExpected: getSchedulerEnabled(),
    intervalSeconds: getSchedulerIntervalSeconds(),
    lastRunAt: runSummary?.completedAt ?? runSummary?.startedAt ?? null,
    lastRun: runSummary,
    pendingScheduled,
    overdueScheduled,
    ...getServerClockStatus(now),
    safeMode: isSafeMode(),
    dryRun: isDryRunMode(),
    ultramsgMock: isEnvTrue(process.env.ULTRAMSG_MOCK),
    hasDefaultRecipient: hasDefaultRecipient(),
  };
}

async function getSchedulerDataDb(): Promise<SchedulerData> {
  const [scheduledAnnouncements, recentLogs, status] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        status: {
          in: [AnnouncementStatus.SCHEDULED, AnnouncementStatus.SENDING],
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      include: {
        segment: {
          select: {
            id: true,
            name: true,
            estimatedUsers: true,
          },
        },
      },
    }),
    getRecentLogs(8),
    getSchedulerStatusDb(),
  ]);

  return {
    scheduledAnnouncements: scheduledAnnouncements.map(serializeAnnouncement),
    recentLogs,
    status,
  };
}

async function getMetricsDataDb(): Promise<MetricsData> {
  const [logs, typeUsage, demoLogs] = await Promise.all([
    prisma.deliveryLog.findMany({
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
          },
        },
        segment: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.announcement.findMany({
      select: {
        type: true,
        customTypeLabel: true,
      },
    }),
    prisma.deliveryLog.findMany({
      where: {
        mode: DeliveryMode.DEMO,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
          },
        },
        segment: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const segmentReachMap = new Map<string, number>();

  for (const log of logs) {
    const key = log.segment?.name ?? "Cobertura general";
    segmentReachMap.set(key, (segmentReachMap.get(key) ?? 0) + log.deliveredCount);
  }

  const typeBreakdown = buildTypeBreakdown(typeUsage);
  const typeUsageSorted = [...typeBreakdown].sort((left, right) => right.value - left.value);

  return {
    totals: {
      executedMessages: logs.length,
      deliveredUsers: logs.reduce((total, log) => total + log.deliveredCount, 0),
      demoExecutions: logs.filter((log) => log.mode === DeliveryMode.DEMO).length,
      mostUsedType: typeUsageSorted[0]?.label ?? formatAnnouncementTypeLabel("GENERAL"),
    },
    deliveryTrend: buildTrendFromLogs(logs),
    typeUsage: typeBreakdown,
    segmentReach: Array.from(segmentReachMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value),
    recentDemoLogs: demoLogs.map(serializeDeliveryLog),
  };
}

async function createFailedDeliveryLogDb(
  announcementId: string,
  error: unknown,
  segmentId: string | null = null,
) {
  const message =
    error instanceof Error ? error.message : "No se pudo enviar el comunicado programado.";

  return markAnnouncementFailedWithLogDb({
    announcementId,
    segmentId,
    mode: DeliveryMode.SCHEDULED,
    details: /sin destinatarios/i.test(message) ? buildNoRecipientsMessage() : message,
  });
}

async function processScheduledAnnouncementsDb(
  options: ProcessScheduledOptions = {},
): Promise<SchedulerRunResult> {
  const source = options.source ?? "worker";
  const startedAt = new Date();
  const run = await prisma.schedulerRun.create({
    data: {
      source,
      startedAt,
    },
  });

  console.log("[scheduler] tick", {
    source,
    startedAt: startedAt.toISOString(),
  });

  const dueAnnouncements = await prisma.announcement.findMany({
    where: {
      status: AnnouncementStatus.SCHEDULED,
      scheduledAt: {
        lte: startedAt,
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });

  console.log("[scheduler] due announcements found", {
    source,
    count: dueAnnouncements.length,
  });

  const processed: DeliveryLogSummary[] = [];
  let lockedCount = 0;
  let skippedCount = 0;

  for (const announcement of dueAnnouncements) {
    const lock = await prisma.announcement.updateMany({
      where: {
        id: announcement.id,
        status: AnnouncementStatus.SCHEDULED,
        scheduledAt: {
          lte: startedAt,
        },
      },
      data: {
        status: AnnouncementStatus.SENDING,
      },
    });

    if (lock.count !== 1) {
      skippedCount += 1;
      console.log("[scheduler] announcement skipped", {
        announcementId: announcement.id,
        reason: "lock_not_acquired",
      });
      continue;
    }

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

        processed.push(
          await markAnnouncementFailedWithLogDb({
            announcementId: announcement.id,
            segmentId: audience.id,
            mode: DeliveryMode.SCHEDULED,
            details: `${buildAnnouncementMediaPrefix(announcement)}${buildNoRecipientsMessage()}`,
          }),
        );
        continue;
      }

      console.log("[scheduler] announcement sending", {
        announcementId: announcement.id,
        hasImage: Boolean(announcement.imageUrl),
        hasAudio: Boolean(announcement.audioUrl),
      });

      const result = await sendAnnouncementNowDb(announcement.id, DeliveryMode.SCHEDULED);
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
      console.error("[scheduler] fallo al enviar comunicado programado", {
        announcementId: announcement.id,
        title: announcement.title,
        error: error instanceof Error ? error.message : error,
      });
      console.error("[scheduler] failed", {
        announcementId: announcement.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });

      processed.push(
        isDeliveryLoggedError(error) && error.deliveryLog
          ? error.deliveryLog
          : await createFailedDeliveryLogDb(announcement.id, error, announcement.segmentId),
      );
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

  await prisma.schedulerRun.update({
    where: {
      id: run.id,
    },
    data: {
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
    },
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

export async function listAnnouncements(): Promise<AnnouncementSummary[]> {
  return withMockFallback(listAnnouncementsDb, mockStore.listAnnouncements);
}

export async function createAnnouncement(input: AnnouncementInput) {
  return withMockFallback(
    () => createAnnouncementDb(input),
    () => mockStore.createAnnouncement(input),
  );
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  return withMockFallback(
    () => updateAnnouncementDb(id, input),
    () => mockStore.updateAnnouncement(id, input),
  );
}

export async function deleteAnnouncement(id: string) {
  return withMockFallback(
    () => deleteAnnouncementDb(id),
    () => mockStore.deleteAnnouncement(id),
  );
}

export async function simulateAnnouncementSend(id: string) {
  return withMockFallback(
    () => simulateAnnouncementSendDb(id),
    () => mockStore.simulateAnnouncementSend(id),
  );
}

export async function sendAnnouncementNow(
  id: string,
  mode: DeliveryMode = DeliveryMode.MANUAL,
) {
  return withMockFallback(
    () => sendAnnouncementNowDb(id, mode),
    () => mockStore.sendAnnouncementNow(id, mode),
  );
}

export async function listSegments(): Promise<SegmentSummary[]> {
  return withMockFallback(listSegmentsDb, mockStore.listSegments);
}

export async function createSegment(input: SegmentInput) {
  return withMockFallback(
    () => createSegmentDb(input),
    () => mockStore.createSegment(input),
  );
}

export async function updateSegment(id: string, input: SegmentInput) {
  return withMockFallback(
    () => updateSegmentDb(id, input),
    () => mockStore.updateSegment(id, input),
  );
}

export async function deleteSegment(id: string) {
  return withMockFallback(
    () => deleteSegmentDb(id),
    () => mockStore.deleteSegment(id),
  );
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntrySummary[]> {
  return withMockFallback(listKnowledgeEntriesDb, mockStore.listKnowledgeEntries);
}

export async function listKnowledgeEntriesFromDatabase(): Promise<KnowledgeEntrySummary[]> {
  return listKnowledgeEntriesDb();
}

export async function listKnowledgeDashboard(input: KnowledgeListFilters = {}) {
  return withMockFallback(
    () => listKnowledgeDashboardDb(input),
    () => mockStore.listKnowledgeDashboard(input),
  );
}

export async function getKnowledgeEntry(id: string) {
  return getKnowledgeEntryDb(id);
}

export async function createKnowledgeEntry(input: KnowledgeInput) {
  return createKnowledgeEntryDb(input);
}

export async function updateKnowledgeEntry(id: string, input: KnowledgeInput) {
  return updateKnowledgeEntryDb(id, input);
}

export async function deleteKnowledgeEntry(id: string) {
  return deleteKnowledgeEntryDb(id);
}

export async function toggleKnowledgeEntryActive(id: string) {
  return toggleKnowledgeEntryActiveDb(id);
}

export async function markKnowledgeEntryReviewed(id: string) {
  return markKnowledgeEntryReviewedDb(id);
}

export async function bulkUpdateKnowledgeEntries(input: KnowledgeBulkActionInput) {
  return bulkUpdateKnowledgeEntriesDb(input);
}

export async function testKnowledgeAnswer(input: KnowledgeTestAnswerInput) {
  return testKnowledgeAnswerDb(input);
}

export async function getDashboardData(): Promise<DashboardData> {
  return withMockFallback(getDashboardDataDb, mockStore.getDashboardData);
}

export async function getSchedulerData(): Promise<SchedulerData> {
  return withMockFallback(getSchedulerDataDb, mockStore.getSchedulerData);
}

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  return withMockFallback(getSchedulerStatusDb, mockStore.getSchedulerStatus);
}

export async function getMetricsData(): Promise<MetricsData> {
  return withMockFallback(getMetricsDataDb, mockStore.getMetricsData);
}

export async function processScheduledAnnouncements(
  options: ProcessScheduledOptions = {},
): Promise<SchedulerRunResult> {
  return withMockFallback(
    () => processScheduledAnnouncementsDb(options),
    () => mockStore.processScheduledAnnouncements(options),
  );
}
