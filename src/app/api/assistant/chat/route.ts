import { z } from "zod";

import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { chatWithAssistant } from "@/server/rionegro-assistant";

const assistantChatSchema = z.object({
  sessionId: z.string().trim().min(1, "La sesion es obligatoria."),
  message: z.string().trim().min(1, "Escribe un mensaje."),
  profile: z
    .object({
      zone: z.string().trim().max(120).optional().nullable(),
      userType: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, assistantChatSchema);
    return ok(await chatWithAssistant(payload.sessionId, payload.message, payload.profile));
  } catch (error) {
    return handleApiError(error);
  }
}
