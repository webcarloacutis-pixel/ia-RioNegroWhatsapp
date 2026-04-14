import { assertAdminApiSession, clearAdminSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";

export async function POST() {
  try {
    await assertAdminApiSession();
    await clearAdminSession();
    return ok({ authenticated: false });
  } catch (error) {
    return handleApiError(error);
  }
}
