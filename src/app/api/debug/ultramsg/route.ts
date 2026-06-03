import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { getUltraMsgDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminApiRequest(request);
    return NextResponse.json(getUltraMsgDiagnostics());
  } catch (error) {
    return handleApiError(error);
  }
}
