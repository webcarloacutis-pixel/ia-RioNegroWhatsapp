import { NextResponse } from "next/server";

import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  buildQaDashboardData,
  buildQaExportCsv,
  buildQaExportPdf,
} from "@/server/qa-dashboard-service";

function filename(extension: string) {
  return `rionegro-qa-report-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export async function GET(request: Request) {
  try {
    await assertAdminApiSession();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    const data = await buildQaDashboardData();

    if (format === "csv") {
      return new NextResponse(buildQaExportCsv(data), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename("csv")}"`,
        },
      });
    }

    if (format === "pdf") {
      return new NextResponse(buildQaExportPdf(data), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename("pdf")}"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename("json")}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
