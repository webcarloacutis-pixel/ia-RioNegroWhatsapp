import { z } from "zod";

import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { resetConversation } from "@/server/rionegro-assistant";

const assistantResetSchema = z.object({
  sessionId: z.string().trim().min(1, "La sesion es obligatoria."),
});

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, assistantResetSchema);
    return ok({
      history: resetConversation(payload.sessionId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
