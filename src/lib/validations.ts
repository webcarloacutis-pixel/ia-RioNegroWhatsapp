import { z } from "zod";

import {
  KNOWLEDGE_CATEGORY_SUGGESTIONS,
  normalizeAnnouncementType,
} from "@/lib/constants";
import { isPublicHttpUrl } from "@/lib/url-security";

const MAX_ANNOUNCEMENT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ANNOUNCEMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const nullableTrimmedString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .nullable()
    .transform((value) => value || null);

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
