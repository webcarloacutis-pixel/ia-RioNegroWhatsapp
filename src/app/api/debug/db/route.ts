import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { assertAdminApiRequest } from "@/lib/auth";
import { getDbDiagnostics } from "@/server/qa-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminApiRequest(request);
    const result = await getDbDiagnostics();
    return NextResponse.json(result, { status: result.ok ? 200 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
