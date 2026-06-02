import { NextResponse } from "next/server";

import { getDbDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET() {
  const result = await getDbDiagnostics();
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
