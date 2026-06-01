import { getAdminProfile } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function GET() {
  const profile = await getAdminProfile();
  console.log("[auth] session check", {
    authenticated: Boolean(profile),
    route: "/api/auth/session",
  });

  return ok({
    authenticated: Boolean(profile),
    profile,
  });
}
