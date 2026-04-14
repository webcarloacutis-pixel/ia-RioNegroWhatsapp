import { getAdminProfile } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function GET() {
  const profile = await getAdminProfile();
  return ok({
    authenticated: Boolean(profile),
    profile,
  });
}
