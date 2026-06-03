import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminApiRequest(request);
    return NextResponse.json({
      ok: true,
      message: "Webhook route is alive",
      postUrl: "/api/webhook",
      acceptedContentTypes: [
        "application/json",
        "application/x-www-form-urlencoded",
        "text/plain",
      ],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
