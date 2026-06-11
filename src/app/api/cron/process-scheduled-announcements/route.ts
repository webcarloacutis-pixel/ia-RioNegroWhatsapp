import { NextResponse } from "next/server";

import { withApiLogging } from "@/lib/api";
import { logger } from "@/lib/logger";
import { processAssistantMemoryTimeouts } from "@/server/assistant-memory-service";
import { processScheduledAnnouncements } from "@/server/panel-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiLogging(request, { module: "cron" }, async (requestId) => {
    const configuredSecret = process.env.CRON_SECRET?.trim();
    const urlSecret = new URL(request.url).searchParams.get("secret")?.trim();
    const headerSecret = request.headers.get("x-cron-secret")?.trim();
    const providedSecret = headerSecret || urlSecret;

    if (!configuredSecret || providedSecret !== configuredSecret) {
      logger.warn("cron", "unauthorized cron request", {
        requestId,
        hasConfiguredSecret: Boolean(configuredSecret),
        providedByHeader: Boolean(headerSecret),
        providedByQuery: Boolean(urlSecret),
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
          requestId,
        },
        { status: 401 },
      );
    }

    logger.info("cron", "scheduled announcements processing started", { requestId });
    const result = await processScheduledAnnouncements({ source: "cron" });
    const assistantMemory = await processAssistantMemoryTimeouts();

    return NextResponse.json({
      ok: true,
      requestId,
      processed: result.processedCount,
      sent: result.sentCount,
      failed: result.failedCount,
      simulated: result.simulatedCount,
      blocked: result.blockedCount,
      due: result.dueCount,
      locked: result.lockedCount,
      skipped: result.skippedCount,
      assistantMemory,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
    });
  });
}
