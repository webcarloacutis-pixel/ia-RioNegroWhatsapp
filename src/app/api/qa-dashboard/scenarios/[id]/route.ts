import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { qaScenarioPatchSchema } from "@/lib/validations";
import { deleteQaScenario, updateQaScenario } from "@/server/qa-dashboard-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    const payload = await parseRequestBody(request, qaScenarioPatchSchema);
    return ok(await updateQaScenario(id, payload));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await deleteQaScenario(id));
  } catch (error) {
    return handleApiError(error);
  }
}
