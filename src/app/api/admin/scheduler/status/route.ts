import { NextResponse } from "next/server";

import { withApiLogging } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getSchedulerStatus } from "@/server/panel-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiLogging(request, { module: "scheduler" }, async (requestId) => {
    assertAdminApiRequest(request);
    logger.info("scheduler", "status requested", { requestId });
    const status = await getSchedulerStatus();

    return NextResponse.json({
      ok: true,
      requestId,
      ...status,
    });
  });
}
