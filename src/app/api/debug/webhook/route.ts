import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
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
}
