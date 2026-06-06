import { NextResponse } from "next/server";

import { assertAdminApiRequest } from "@/lib/auth";
import { withApiLogging } from "@/lib/api";
import { getEnvDiagnostics } from "@/server/diagnostics-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiLogging(request, { module: "env" }, async (requestId) => {
    assertAdminApiRequest(request);
    const diagnostics = getEnvDiagnostics();

    return NextResponse.json({
      ...diagnostics,
      requestId,
    });
  });
}
