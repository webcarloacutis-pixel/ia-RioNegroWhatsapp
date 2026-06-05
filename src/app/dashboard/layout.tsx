import { AppShell } from "@/components/layout/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { getChannelRuntimeStatusFromDatabase } from "@/server/channel-status-service";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await requireAdminSession();
  const channelStatus = await getChannelRuntimeStatusFromDatabase();

  return (
    <AppShell adminEmail={profile.email} channelStatus={channelStatus}>
      {children}
    </AppShell>
  );
}
