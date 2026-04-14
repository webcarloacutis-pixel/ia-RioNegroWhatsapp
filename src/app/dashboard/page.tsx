import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { getDashboardData } from "@/server/panel-service";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardOverview data={data} />;
}
