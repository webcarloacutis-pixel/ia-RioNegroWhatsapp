import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { buildQaDashboardData } from "@/server/qa-dashboard-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    return ok(await buildQaDashboardData());
  } catch (error) {
    return handleApiError(error);
  }
}
