import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { processScheduledAnnouncements } from "@/server/panel-service";

export async function POST() {
  try {
    await assertAdminApiSession();
    const result = await processScheduledAnnouncements();
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
