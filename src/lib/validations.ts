import { z } from "zod";

import {
  ANNOUNCEMENT_TYPE_VALUES,
  KNOWLEDGE_CATEGORY_SUGGESTIONS,
} from "@/lib/constants";

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
  type: z.enum(ANNOUNCEMENT_TYPE_VALUES, {
    error: "Selecciona el tipo de comunicado.",
  }),
  scheduledAt: z.string().min(1, "Selecciona fecha y hora de envio."),
  segmentId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null),
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
