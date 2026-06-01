import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import type { CitizenReportPriority, CitizenReportStatus } from "@/lib/types";
import { listCitizenReports } from "@/server/citizen-report-service";

export async function GET(request: Request) {
  try {
    await assertAdminApiSession();
    const { searchParams } = new URL(request.url);

    return ok(
      await listCitizenReports({
        status: (searchParams.get("status") || undefined) as
          | CitizenReportStatus
          | undefined,
        category: searchParams.get("category") || undefined,
        type: searchParams.get("type") || undefined,
        priority: (searchParams.get("priority") || undefined) as
          | CitizenReportPriority
          | undefined,
        search: searchParams.get("search") || undefined,
        limit: Number(searchParams.get("limit") || 100),
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
