import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { knowledgeBulkActionSchema } from "@/lib/validations";
import { bulkUpdateKnowledgeEntries } from "@/server/panel-service";

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, knowledgeBulkActionSchema);
    return ok(await bulkUpdateKnowledgeEntries(payload));
  } catch (error) {
    return handleApiError(error);
  }
}
