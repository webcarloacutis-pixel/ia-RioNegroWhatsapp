import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { qaScenarioInputSchema } from "@/lib/validations";
import { createQaScenario, listQaScenarios } from "@/server/qa-dashboard-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    return ok(await listQaScenarios());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, qaScenarioInputSchema);
    return ok(await createQaScenario(payload), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
