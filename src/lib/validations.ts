import { z } from "zod";

import {
  KNOWLEDGE_CATEGORY_SUGGESTIONS,
  KNOWLEDGE_INTENT_SUGGESTIONS,
  KNOWLEDGE_SOURCE_TYPES,
  normalizeAnnouncementType,
} from "@/lib/constants";
import { isPublicHttpUrl } from "@/lib/url-security";

const MAX_ANNOUNCEMENT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ANNOUNCEMENT_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_ANNOUNCEMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const ALLOWED_ANNOUNCEMENT_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
] as const;

const nullableTrimmedString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .nullable()
    .transform((value) => value || null);

const knowledgeTextListSchema = z
  .union([z.array(z.string()), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const rawItems = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[,\n;]/)
        : [];

    return Array.from(
      new Set(
        rawItems
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .slice(0, 30),
      ),
    );
  });

const nullableKnowledgeDateSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "string") {
      return new Date(value);
    }

    return value;
  },
  z.date("La fecha de verificacion no es valida.").nullable(),
);

function normalizeRecipientPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits.startsWith("57") ? `+${digits}` : `+57${digits}`;
}

function parseRecipientPhones(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => (typeof item === "string" ? normalizeRecipientPhone(item) : null))
          .filter((item): item is string => Boolean(item)),
      ),
    );
  }

  if (typeof value !== "string") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[,\n;]/)
        .map((item) => normalizeRecipientPhone(item.trim()))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

export const loginSchema = z.object({
  email: z.email("Ingresa un correo valido."),
  password: z.string().min(1, "Ingresa la contrasena."),
});

export const announcementInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "El titulo debe tener al menos 3 caracteres.")
    .max(120, "El titulo no puede superar 120 caracteres."),
  message: z
    .string()
    .trim()
    .min(10, "El mensaje debe tener al menos 10 caracteres.")
    .max(1000, "El mensaje no puede superar 1000 caracteres."),
  location: z
    .string()
    .trim()
    .max(120, "El lugar no puede superar 120 caracteres.")
    .optional()
    .nullable()
    .transform((value) => value || null),
  type: z
    .string()
    .trim()
    .min(2, "Selecciona o escribe el tipo de comunicado.")
    .max(60, "El tipo de comunicado es demasiado largo.")
    .transform((value) => normalizeAnnouncementType(value)),
  scheduledAt: z
    .string()
    .min(1, "Selecciona fecha y hora de envio.")
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "La fecha y hora no tiene un formato valido."),
  segmentId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null),
  imageUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null)
    .refine((value) => !value || isPublicHttpUrl(value), "La URL de la imagen no es publica."),
  imagePublicId: nullableTrimmedString(180, "El identificador de imagen es demasiado largo."),
  imageFilename: nullableTrimmedString(180, "El nombre del archivo es demasiado largo."),
  imageMimeType: z
    .enum(ALLOWED_ANNOUNCEMENT_IMAGE_MIME_TYPES)
    .optional()
    .nullable()
    .transform((value) => value || null),
  imageSize: z
    .number()
    .int("El tamano de la imagen debe ser entero.")
    .min(1, "El tamano de la imagen no es valido.")
    .max(MAX_ANNOUNCEMENT_IMAGE_BYTES, "La imagen no puede superar 5 MB.")
    .optional()
    .nullable()
    .transform((value) => value ?? null),
  imageProvider: nullableTrimmedString(40, "El proveedor de imagen es demasiado largo."),
  audioUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null)
    .refine((value) => !value || isPublicHttpUrl(value), "La URL del audio no es publica."),
  audioPublicId: nullableTrimmedString(180, "El identificador de audio es demasiado largo."),
  audioFilename: nullableTrimmedString(180, "El nombre del audio es demasiado largo."),
  audioMimeType: z
    .enum(ALLOWED_ANNOUNCEMENT_AUDIO_MIME_TYPES)
    .optional()
    .nullable()
    .transform((value) => value || null),
  audioSize: z
    .number()
    .int("El tamano del audio debe ser entero.")
    .min(1, "El tamano del audio no es valido.")
    .max(MAX_ANNOUNCEMENT_AUDIO_BYTES, "El audio no puede superar 15 MB.")
    .optional()
    .nullable()
    .transform((value) => value ?? null),
  audioDuration: z
    .number()
    .int("La duracion del audio debe ser entera.")
    .min(0, "La duracion del audio no es valida.")
    .max(5 * 60, "El audio no puede superar 5 minutos.")
    .optional()
    .nullable()
    .transform((value) => value ?? null),
  audioProvider: nullableTrimmedString(40, "El proveedor de audio es demasiado largo."),
});

export const segmentInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre del segmento es obligatorio.")
    .max(80, "El nombre es demasiado largo."),
  description: z
    .string()
    .trim()
    .max(180, "La descripcion no puede superar 180 caracteres.")
    .optional()
    .nullable()
    .transform((value) => value || null),
  estimatedUsers: z.coerce
    .number()
    .int("El numero estimado debe ser entero.")
    .min(0, "El numero estimado no puede ser negativo.")
    .max(500000, "El numero estimado es demasiado alto."),
  recipientPhones: z
    .unknown()
    .optional()
    .transform((value) => parseRecipientPhones(value)),
});

export const knowledgeInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(5, "La pregunta debe tener al menos 5 caracteres.")
    .max(180, "La pregunta es demasiado larga."),
  answer: z
    .string()
    .trim()
    .min(10, "La respuesta debe tener al menos 10 caracteres.")
    .max(2000, "La respuesta es demasiado larga."),
  category: z
    .string()
    .trim()
    .min(2, "La categoria es obligatoria.")
    .max(60, "La categoria es demasiado larga.")
    .default(KNOWLEDGE_CATEGORY_SUGGESTIONS[0]),
  intent: z
    .string()
    .trim()
    .max(80, "La intencion es demasiado larga.")
    .optional()
    .nullable()
    .transform((value) => value || null)
    .refine(
      (value) =>
        !value || (KNOWLEDGE_INTENT_SUGGESTIONS as readonly string[]).includes(value),
      "La intencion no es valida.",
    ),
  shortAnswer: nullableTrimmedString(600, "La respuesta corta es demasiado larga."),
  tags: knowledgeTextListSchema,
  aliases: knowledgeTextListSchema,
  sourceUrl: z
    .string()
    .trim()
    .max(600, "La URL fuente es demasiado larga.")
    .optional()
    .nullable()
    .transform((value) => value || null)
    .refine((value) => !value || isPublicHttpUrl(value), "La URL fuente no es publica."),
  sourceName: nullableTrimmedString(160, "El nombre de la fuente es demasiado largo."),
  sourceType: z
    .string()
    .trim()
    .default("manual_admin")
    .refine(
      (value) => (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(value),
      "El tipo de fuente no es valido.",
    ),
  isOfficial: z.boolean().default(false),
  isActive: z.boolean().default(true),
  needsReview: z.boolean().default(false),
  confidence: z.coerce
    .number()
    .min(0, "La confianza no puede ser menor a 0.")
    .max(1, "La confianza no puede ser mayor a 1.")
    .default(0.8),
  lastVerifiedAt: nullableKnowledgeDateSchema.default(null),
});

export const knowledgeBulkActionSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "Selecciona al menos una ficha.").max(100),
  action: z.enum(["activate", "deactivate", "markReviewed", "changeCategory"]),
  category: z
    .string()
    .trim()
    .min(2, "La categoria es obligatoria.")
    .max(60, "La categoria es demasiado larga.")
    .optional(),
});

export const knowledgeTestAnswerSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Escribe una pregunta para Eva.")
    .max(300, "La pregunta de prueba es demasiado larga."),
  entryId: z.string().trim().optional().nullable(),
});

const qaKeywordListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Cada palabra clave debe tener contenido.")
      .max(80, "La palabra clave es demasiado larga."),
  )
  .max(12, "Maximo 12 palabras clave por escenario.")
  .default([])
  .transform((items) => Array.from(new Set(items.filter(Boolean))));

const qaKeywordGroupSchema = z
  .array(qaKeywordListSchema)
  .max(12, "Maximo 12 grupos de equivalencias por escenario.")
  .default([]);

export const qaScenarioInputSchema = z.object({
  category: z
    .string()
    .trim()
    .min(2, "La categoria es obligatoria.")
    .max(80, "La categoria es demasiado larga."),
  title: z
    .string()
    .trim()
    .min(3, "El titulo debe tener al menos 3 caracteres.")
    .max(120, "El titulo no puede superar 120 caracteres."),
  description: z
    .string()
    .trim()
    .max(500, "La descripcion no puede superar 500 caracteres.")
    .default(""),
  input: z
    .string()
    .trim()
    .min(1, "El mensaje de prueba es obligatorio.")
    .max(3000, "El mensaje de prueba es demasiado largo."),
  expectedBehavior: z
    .string()
    .trim()
    .min(5, "Describe el comportamiento esperado.")
    .max(1000, "El comportamiento esperado es demasiado largo."),
  expectedIntent: z
    .string()
    .trim()
    .max(80, "La intencion esperada es demasiado larga.")
    .optional(),
  expectedShouldCreateAlert: z.boolean().optional(),
  expectedAlertCategory: z
    .string()
    .trim()
    .max(80, "La categoria esperada es demasiado larga.")
    .optional(),
  expectedAlertPriority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  expectedAlertLocation: z
    .string()
    .trim()
    .max(120, "La ubicacion esperada es demasiado larga.")
    .optional(),
  expectedAskedConfirmation: z.boolean().optional(),
  expectedUsedKnowledgeBase: z.boolean().optional(),
  expectedKeywords: qaKeywordListSchema,
  acceptableKeywords: qaKeywordGroupSchema,
  forbiddenKeywords: qaKeywordListSchema,
  requiredConcepts: qaKeywordListSchema,
  forbiddenConcepts: qaKeywordListSchema,
  expectedSafetyBehavior: z
    .enum(["refuse_private_data", "refuse_prompt_injection", "none"])
    .default("none"),
  allowForbiddenKeywordIfNegated: z.boolean().default(false),
  mustBeShort: z.boolean().default(false),
  mustNotUseBullets: z.boolean().default(false),
  mustMentionLocationIfProvided: z.boolean().default(false),
  mustPreserveTopic: z
    .string()
    .trim()
    .max(80, "El tema a preservar es demasiado largo.")
    .optional(),
  active: z.boolean().default(true),
});

export const qaScenarioPatchSchema = qaScenarioInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Debes enviar al menos un campo para actualizar.",
);

export const qaRunInputSchema = z
  .object({
    scenarioIds: z.array(z.string().trim().min(1)).max(200).optional(),
    includeInactive: z.boolean().default(false),
    evaluatorMode: z.enum(["rules", "gpt"]).default("rules"),
  })
  .default({
    includeInactive: false,
    evaluatorMode: "rules",
  });
