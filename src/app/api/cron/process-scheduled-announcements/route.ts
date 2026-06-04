import { NextResponse } from "next/server";

import { processScheduledAnnouncements } from "@/server/panel-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const providedSecret = new URL(request.url).searchParams.get("secret")?.trim();

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  const result = await processScheduledAnnouncements({ source: "cron" });

  return NextResponse.json({
    ok: true,
    processed: result.processedCount,
    sent: result.sentCount,
    failed: result.failedCount,
    simulated: result.simulatedCount,
    blocked: result.blockedCount,
    due: result.dueCount,
    locked: result.lockedCount,
    skipped: result.skippedCount,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  });
}
