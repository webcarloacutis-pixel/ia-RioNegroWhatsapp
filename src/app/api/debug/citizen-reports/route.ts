import { NextResponse } from "next/server";

import { getCitizenReportsDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getCitizenReportsDiagnostics());
}
