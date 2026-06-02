import { NextResponse } from "next/server";

import { getAnnouncementsDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getAnnouncementsDiagnostics());
}
