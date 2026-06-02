import { NextResponse } from "next/server";

import { getUltraMsgDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getUltraMsgDiagnostics());
}
