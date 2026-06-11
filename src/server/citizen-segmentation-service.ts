import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logger, sanitizeError } from "@/lib/logger";
import type { SupportedLanguage } from "@/lib/language";

export const ALL_RIONEGRENSES_SEGMENT_NAME = "Todos los rionegrenses";

const ALL_RIONEGRENSES_SEGMENT_DESCRIPTION =
  "Segmento automatico de ciudadanos que han escrito a Eva por WhatsApp.";

type EnsureCitizenSegmentInput = {
  phoneNumber: string;
  source?: string;
  messageType?: string | null;
  language?: SupportedLanguage | null;
  metadata?: Record<string, unknown>;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map(toJsonValue)
      .filter((item): item is Prisma.InputJsonValue => typeof item !== "undefined");
  }

  if (value && typeof value === "object") {
    const output: Record<string, Prisma.InputJsonValue> = {};

    for (const [entryKey, entryValue] of Object.entries(value)) {
      const jsonValue = toJsonValue(entryValue);

      if (typeof jsonValue !== "undefined") {
        output[entryKey] = jsonValue;
      }
    }

    return output as Prisma.InputJsonObject;
  }

  return undefined;
}

function compactMetadata(metadata: Record<string, unknown>): Prisma.InputJsonObject {
  const output: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const jsonValue = toJsonValue(value);

    if (typeof jsonValue !== "undefined") {
      output[key] = jsonValue;
    }
  }

  return output as Prisma.InputJsonObject;
}

export function normalizeCitizenPhoneForSegment(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return null;
  if (digits.startsWith("57")) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  return `+${digits}`;
}

export function mergeRecipientPhones(currentPhones: string[], nextPhone: string) {
  const normalizedNext = normalizeCitizenPhoneForSegment(nextPhone);
  const normalizedCurrent = currentPhones
    .map(normalizeCitizenPhoneForSegment)
    .filter((phone): phone is string => Boolean(phone));

  return Array.from(new Set(normalizedNext ? [...normalizedCurrent, normalizedNext] : normalizedCurrent));
}

export async function ensureCitizenSegmentMembership(input: EnsureCitizenSegmentInput) {
  if (process.env.CITIZEN_SEGMENTATION_DISABLED === "true") {
    return {
      ok: true,
      skipped: true,
      reason: "disabled",
    };
  }

  const phoneNumber = normalizeCitizenPhoneForSegment(input.phoneNumber);

  if (!phoneNumber) {
    return {
      ok: false,
      reason: "invalid_phone",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.citizenContact.upsert({
        where: { phoneNumber },
        create: {
          phoneNumber,
          source: input.source ?? "whatsapp",
          messageCount: 1,
          lastLanguage: input.language ?? null,
          lastMessageType: input.messageType ?? null,
          metadata: compactMetadata(input.metadata ?? {}),
          firstSeenAt: now,
          lastSeenAt: now,
          lastInboundAt: now,
        },
        update: {
          source: input.source ?? "whatsapp",
          messageCount: {
            increment: 1,
          },
          lastLanguage: input.language ?? undefined,
          lastMessageType: input.messageType ?? undefined,
          metadata: compactMetadata(input.metadata ?? {}),
          lastSeenAt: now,
          lastInboundAt: now,
        },
      });

      const segment = await tx.segment.upsert({
        where: { name: ALL_RIONEGRENSES_SEGMENT_NAME },
        create: {
          name: ALL_RIONEGRENSES_SEGMENT_NAME,
          description: ALL_RIONEGRENSES_SEGMENT_DESCRIPTION,
          estimatedUsers: 1,
          recipientPhones: [phoneNumber],
        },
        update: {
          description: ALL_RIONEGRENSES_SEGMENT_DESCRIPTION,
        },
      });
      const mergedPhones = mergeRecipientPhones(segment.recipientPhones, phoneNumber);
      const phoneWasAdded = mergedPhones.length !== segment.recipientPhones.length;

      if (phoneWasAdded || segment.estimatedUsers !== mergedPhones.length) {
        await tx.segment.update({
          where: { id: segment.id },
          data: {
            recipientPhones: mergedPhones,
            estimatedUsers: mergedPhones.length,
          },
        });
      }

      return {
        ok: true,
        segmentId: segment.id,
        phoneWasAdded,
        recipientCount: mergedPhones.length,
      };
    });
  } catch (error) {
    logger.warn("citizen-segmentation", "auto segment skipped", {
      phoneNumber,
      error: sanitizeError(error),
    });

    return {
      ok: false,
      reason: "db_error",
    };
  }
}
