import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { getMetricsData } from "@/server/panel-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    const data = await getMetricsData();
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
