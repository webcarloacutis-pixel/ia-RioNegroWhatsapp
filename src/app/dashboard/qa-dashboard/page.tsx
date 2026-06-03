import { QaDashboardPanel } from "@/components/modules/qa-dashboard-panel";
import { buildQaDashboardData } from "@/server/qa-dashboard-service";

export default async function QaDashboardPage() {
  const data = await buildQaDashboardData();

  return <QaDashboardPanel initialData={data} />;
}
