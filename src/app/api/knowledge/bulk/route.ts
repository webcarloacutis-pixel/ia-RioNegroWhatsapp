import { assertAdminApiSession } from "@/lib/auth";
import { ok, parseRequestBody, withApiLogging } from "@/lib/api";
import { logger } from "@/lib/logger";
import { knowledgeBulkActionSchema } from "@/lib/validations";
import { bulkUpdateKnowledgeEntries } from "@/server/panel-service";

export async function POST(request: Request) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, knowledgeBulkActionSchema);
    logger.info("knowledge", "bulk action requested", {
      requestId,
      action: payload.action,
      selectedCount: payload.ids.length,
      category: payload.category,
    });
    return ok(await bulkUpdateKnowledgeEntries(payload));
  });
}
