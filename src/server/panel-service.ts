import {
  AnnouncementStatus,
  AnnouncementType,
  DeliveryMode,
  DeliveryStatus,
} from "@prisma/client";
import { subDays } from "date-fns";

import {
  DEFAULT_ANNOUNCEMENT_TYPES,
  DEFAULT_AUDIENCE_SIZE,
  formatAnnouncementTypeLabel,
  normalizeAnnouncementType,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  AnnouncementSummary,
  DashboardData,
  DeliveryLogSummary,
  KnowledgeEntrySummary,
  MetricsData,
  SchedulerData,
  SegmentSummary,
} from "@/lib/types";
import * as mockStore from "@/server/mock-store";
import { serializeAnnouncement, serializeDeliveryLog, serializeKnowledgeEntry, serializeSegment } from "@/server/serializers";
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

let fallbackWarningShown = false;

function parseScheduledDate(value: string) {
  const date = new Date(value);

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
    Boolean(errorWithCode.code && prismaRecoverableCodes.has(errorWithCode.code)) ||
    message.includes("Authentication failed against database server") ||
    message.includes("Can't reach database server") ||
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
      console.warn(
        "[panel-service] PostgreSQL no esta disponible. Se activa el modo demo en memoria para que el panel siga funcionando.",
      );
      fallbackWarningShown = true;
    }

    console.warn("[dashboard] using fallback data", {
      error: error instanceof Error ? error.message : "unknown_error",
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
  const resolvedType = resolveAnnouncementTypeInput(input.type);
  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      message: input.message,
      location: input.location,
      type: resolvedType.type,
      customTypeLabel: resolvedType.customTypeLabel,
      scheduledAt: parseScheduledDate(input.scheduledAt),
      segmentId: input.segmentId,
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

async function updateAnnouncementDb(id: string, input: AnnouncementInput) {
  await getAnnouncementOrThrow(id);
  const resolvedType = resolveAnnouncementTypeInput(input.type);

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      title: input.title,
      message: input.message,
      location: input.location,
      type: resolvedType.type,
      customTypeLabel: resolvedType.customTypeLabel,
      scheduledAt: parseScheduledDate(input.scheduledAt),
      segmentId: input.segmentId,
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
  const result = await sendMessage({
    message: announcement.message,
    segment: audience,
    scheduledAt: announcement.scheduledAt,
    mode: "DEMO",
    to: audience.recipientPhones.join(","),
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

  return {
    feedback: result.log,
    log: serializeDeliveryLog(log),
  };
}

async function sendAnnouncementNowDb(
  id: string,
  mode: DeliveryMode = DeliveryMode.MANUAL,
) {
  const announcement = await getAnnouncementOrThrow(id);

  const audience = await resolveAudience(announcement.segmentId);
  const result = await sendMessage({
    message: announcement.message,
    segment: audience,
    scheduledAt: announcement.scheduledAt,
    mode,
    to: audience.recipientPhones.join(","),
  });

  const [updatedAnnouncement, log] = await prisma.$transaction([
    prisma.announcement.update({
      where: { id: announcement.id },
      data: {
        status: AnnouncementStatus.SENT,
        sentAt: new Date(),
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
    }),
  ]);

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

async function listKnowledgeEntriesDb(): Promise<KnowledgeEntrySummary[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });

  return entries.map(serializeKnowledgeEntry);
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

async function getDashboardDataDb(): Promise<DashboardData> {
  const [
    segmentStats,
    totalLogs,
    activeAnnouncementsCount,
    upcoming,
    typeUsage,
    recentLogs,
    trendLogs,
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
  ]);

  return {
    stats: {
      users: segmentStats._sum.estimatedUsers ?? DEFAULT_AUDIENCE_SIZE,
      messages: totalLogs,
      activeAnnouncements: activeAnnouncementsCount,
      segments: segmentStats._count,
    },
    messageTrend: buildTrendFromLogs(trendLogs),
    typeBreakdown: buildTypeBreakdown(typeUsage),
    upcomingAnnouncements: upcoming.map(serializeAnnouncement),
    recentLogs,
  };
}

async function getSchedulerDataDb(): Promise<SchedulerData> {
  const [scheduledAnnouncements, recentLogs] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.SCHEDULED,
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
  ]);

  return {
    scheduledAnnouncements: scheduledAnnouncements.map(serializeAnnouncement),
    recentLogs,
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

async function createFailedDeliveryLogDb(announcementId: string, error: unknown) {
  const log = await prisma.deliveryLog.create({
    data: {
      announcementId,
      mode: DeliveryMode.SCHEDULED,
      status: DeliveryStatus.FAILED,
      deliveredCount: 0,
      details: error instanceof Error ? error.message : "No se pudo enviar el comunicado programado.",
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

  return serializeDeliveryLog(log);
}

async function processScheduledAnnouncementsDb() {
  const dueAnnouncements = await prisma.announcement.findMany({
    where: {
      status: AnnouncementStatus.SCHEDULED,
      scheduledAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });

  const processed: DeliveryLogSummary[] = [];

  for (const announcement of dueAnnouncements) {
    try {
      const result = await sendAnnouncementNowDb(announcement.id, DeliveryMode.SCHEDULED);
      processed.push(result.log);
    } catch (error) {
      console.error("[scheduler] fallo al enviar comunicado programado", {
        announcementId: announcement.id,
        title: announcement.title,
        error: error instanceof Error ? error.message : error,
      });

      processed.push(await createFailedDeliveryLogDb(announcement.id, error));
    }
  }

  return {
    processedCount: processed.filter((log) => log.status === "SUCCESS").length,
    processed,
  };
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

export async function createKnowledgeEntry(input: KnowledgeInput) {
  return withMockFallback(
    () => createKnowledgeEntryDb(input),
    () => mockStore.createKnowledgeEntry(input),
  );
}

export async function updateKnowledgeEntry(id: string, input: KnowledgeInput) {
  return withMockFallback(
    () => updateKnowledgeEntryDb(id, input),
    () => mockStore.updateKnowledgeEntry(id, input),
  );
}

export async function deleteKnowledgeEntry(id: string) {
  return withMockFallback(
    () => deleteKnowledgeEntryDb(id),
    () => mockStore.deleteKnowledgeEntry(id),
  );
}

export async function getDashboardData(): Promise<DashboardData> {
  return withMockFallback(getDashboardDataDb, mockStore.getDashboardData);
}

export async function getSchedulerData(): Promise<SchedulerData> {
  return withMockFallback(getSchedulerDataDb, mockStore.getSchedulerData);
}

export async function getMetricsData(): Promise<MetricsData> {
  return withMockFallback(getMetricsDataDb, mockStore.getMetricsData);
}

export async function processScheduledAnnouncements() {
  return withMockFallback(
    processScheduledAnnouncementsDb,
    mockStore.processScheduledAnnouncements,
  );
}
