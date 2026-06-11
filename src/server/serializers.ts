import type { Prisma } from "@prisma/client";

import type {
  AnnouncementSummary,
  DeliveryLogSummary,
  KnowledgeConflictSummary,
  KnowledgeEntrySummary,
  SegmentSummary,
} from "@/lib/types";

type AnnouncementWithSegment = Prisma.AnnouncementGetPayload<{
  include: {
    segment: {
      select: {
        id: true;
        name: true;
        estimatedUsers: true;
      };
    };
  };
}>;

type SegmentWithMeta = Prisma.SegmentGetPayload<{
  include: {
    _count: {
      select: {
        announcements: true;
      };
    };
    deliveryLogs: {
      select: {
        createdAt: true;
      };
      orderBy: {
        createdAt: "desc";
      };
      take: 1;
    };
  };
}>;

type KnowledgeEntry = Prisma.KnowledgeBaseEntryGetPayload<Record<string, never>>;

type KnowledgeConflict = Prisma.KnowledgeConflictGetPayload<Record<string, never>>;

type DeliveryLogWithRelations = Prisma.DeliveryLogGetPayload<{
  include: {
    announcement: {
      select: {
        id: true;
        title: true;
      };
    };
    segment: {
      select: {
        name: true;
      };
    };
  };
}>;

export function serializeAnnouncement(
  announcement: AnnouncementWithSegment,
): AnnouncementSummary {
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
    segment: announcement.segment
      ? {
          id: announcement.segment.id,
          name: announcement.segment.name,
          estimatedUsers: announcement.segment.estimatedUsers,
        }
      : null,
  };
}

export function serializeSegment(segment: SegmentWithMeta): SegmentSummary {
  return {
    id: segment.id,
    name: segment.name,
    description: segment.description,
    estimatedUsers: segment.estimatedUsers,
    recipientPhones: segment.recipientPhones,
    recipientCount: segment.recipientPhones.length,
    activeAnnouncements: segment._count.announcements,
    lastUsedAt: segment.deliveryLogs[0]?.createdAt.toISOString() ?? null,
    createdAt: segment.createdAt.toISOString(),
  };
}

export function serializeKnowledgeEntry(
  entry: KnowledgeEntry,
): KnowledgeEntrySummary {
  return {
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    questionEn: entry.questionEn ?? null,
    answerEn: entry.answerEn ?? null,
    shortAnswerEn: entry.shortAnswerEn ?? null,
    aliasesEn: entry.aliasesEn ?? [],
    tagsEn: entry.tagsEn ?? [],
    translatedToEnglishAt: entry.translatedToEnglishAt?.toISOString() ?? null,
    category: entry.category,
    intent: entry.intent ?? null,
    shortAnswer: entry.shortAnswer ?? null,
    tags: entry.tags ?? [],
    aliases: entry.aliases ?? [],
    sourceUrl: entry.sourceUrl ?? null,
    sourceName: entry.sourceName ?? null,
    sourceType: entry.sourceType ?? "manual_admin",
    isOfficial: entry.isOfficial ?? false,
    isActive: entry.isActive ?? true,
    needsReview: entry.needsReview ?? false,
    confidence: entry.confidence ?? 0.7,
    lastVerifiedAt: entry.lastVerifiedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function serializeKnowledgeConflict(
  conflict: KnowledgeConflict,
): KnowledgeConflictSummary {
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

export function serializeDeliveryLog(
  log: DeliveryLogWithRelations,
): DeliveryLogSummary {
  return {
    id: log.id,
    announcementId: log.announcement.id,
    announcementTitle: log.announcement.title,
    segmentName: log.segment?.name ?? null,
    mode: log.mode,
    deliveredCount: log.deliveredCount,
    status: log.status,
    details: log.details,
    createdAt: log.createdAt.toISOString(),
  };
}
