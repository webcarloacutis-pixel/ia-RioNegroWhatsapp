import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { getSchedulerStatus } from "@/server/panel-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminApiRequest(request);
    const status = await getSchedulerStatus();

    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
