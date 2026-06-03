import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { qaRunInputSchema } from "@/lib/validations";
import { runQaScenarios } from "@/server/qa-dashboard-service";

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, qaRunInputSchema);
    return ok(await runQaScenarios(payload));
  } catch (error) {
    return handleApiError(error);
  }
}
