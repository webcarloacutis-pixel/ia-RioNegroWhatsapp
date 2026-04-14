import { AppShell } from "@/components/layout/app-shell";
import { requireAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await requireAdminSession();

  return <AppShell adminEmail={profile.email}>{children}</AppShell>;
}
