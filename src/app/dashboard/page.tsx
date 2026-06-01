import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { countPendingCitizenReports } from "@/server/citizen-report-service";
import { getDashboardData } from "@/server/panel-service";

export default async function DashboardPage() {
  console.log("[dashboard] loading data");
  const [data, pendingCitizenReports] = await Promise.all([
    getDashboardData(),
    countPendingCitizenReports(),
  ]);

  return (
    <DashboardOverview
      data={data}
      pendingCitizenReports={pendingCitizenReports}
    />
  );
}
