import { redirect } from "next/navigation";

import { getAdminProfile } from "@/lib/auth";

export default async function HomePage() {
  const profile = await getAdminProfile();
  redirect(profile ? "/dashboard" : "/login");
}
