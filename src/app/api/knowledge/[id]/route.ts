import { assertAdminApiSession } from "@/lib/auth";
import { ok, parseRequestBody, withApiLogging } from "@/lib/api";
import { logger } from "@/lib/logger";
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

export async function GET(request: Request, context: RouteContext) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const { id } = await context.params;
    logger.info("knowledge", "detail requested", { requestId, id });
    return ok(await getKnowledgeEntry(id));
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const { id } = await context.params;
    const payload = await parseRequestBody(request, knowledgeInputSchema);
    logger.info("knowledge", "update requested", {
      requestId,
      id,
      category: payload.category,
      intent: payload.intent,
      isActive: payload.isActive,
      needsReview: payload.needsReview,
    });
    return ok(await updateKnowledgeEntry(id, payload));
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const { id } = await context.params;
    logger.warn("knowledge", "delete requested", { requestId, id });
    return ok(await deleteKnowledgeEntry(id));
  });
}
