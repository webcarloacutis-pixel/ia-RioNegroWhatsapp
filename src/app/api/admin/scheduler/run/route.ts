import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { processScheduledAnnouncements } from "@/server/panel-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAdminApiRequest(request);
    const result = await processScheduledAnnouncements({ source: "admin" });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
