import { NextResponse } from "next/server";

import { assertAdminApiRequest } from "@/lib/auth";
import { withApiLogging } from "@/lib/api";
import { getDbDiagnostics } from "@/server/diagnostics-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiLogging(request, { module: "db" }, async (requestId) => {
    assertAdminApiRequest(request);
    const diagnostics = await getDbDiagnostics();

    return NextResponse.json({
      ...diagnostics,
      requestId,
    });
  });
}
