import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { getDashboardData } from "@/server/panel-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    const data = await getDashboardData();
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
