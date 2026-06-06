import { assertAdminApiSession } from "@/lib/auth";
import { ok, withApiLogging } from "@/lib/api";
import { logger } from "@/lib/logger";
import { markKnowledgeEntryReviewed } from "@/server/panel-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const { id } = await context.params;
    logger.info("knowledge", "mark reviewed requested", { requestId, id });
    return ok(await markKnowledgeEntryReviewed(id));
  });
}
