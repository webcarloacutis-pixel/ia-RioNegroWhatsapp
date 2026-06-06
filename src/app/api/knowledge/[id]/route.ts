import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { knowledgeInputSchema } from "@/lib/validations";
import {
  deleteKnowledgeEntry,
  getKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/server/panel-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await getKnowledgeEntry(id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    const payload = await parseRequestBody(request, knowledgeInputSchema);
    return ok(await updateKnowledgeEntry(id, payload));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await deleteKnowledgeEntry(id));
  } catch (error) {
    return handleApiError(error);
  }
}
