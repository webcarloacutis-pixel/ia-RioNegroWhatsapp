import { NextResponse } from "next/server";

import { withApiLogging } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { processScheduledAnnouncements } from "@/server/panel-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApiLogging(request, { module: "scheduler" }, async (requestId) => {
    assertAdminApiRequest(request);
    logger.info("scheduler", "manual run started", { requestId });
    const result = await processScheduledAnnouncements({ source: "admin" });
    logger.info("scheduler", "manual run completed", {
      requestId,
      processedCount: result.processedCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      simulatedCount: result.simulatedCount,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      ...result,
    });
  });
}
