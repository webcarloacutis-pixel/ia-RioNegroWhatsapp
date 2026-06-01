import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ia-rionegrowhatsapp",
    time: new Date().toISOString(),
    routes: {
      webhook: "/api/webhook",
      dashboard: "/dashboard",
      login: "/login",
    },
  });
}
