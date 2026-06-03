import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { getCitizenReportsDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminApiRequest(request);
    return NextResponse.json(await getCitizenReportsDiagnostics());
  } catch (error) {
    return handleApiError(error);
  }
}
