import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ia-rionegrowhatsapp",
    time: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    environment: process.env.NODE_ENV || "development",
    routes: {
      webhook: "/api/webhook",
      dashboard: "/dashboard",
      login: "/login",
      systemStatus: "/dashboard/estado-sistema",
    },
  });
}
