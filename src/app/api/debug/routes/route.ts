import { NextResponse } from "next/server";

import { getRouteDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getRouteDiagnostics());
}
