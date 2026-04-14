import { SchedulerManager } from "@/components/modules/scheduler-manager";
import { getSchedulerData } from "@/server/panel-service";

export default async function SchedulerPage() {
  const data = await getSchedulerData();
  return <SchedulerManager data={data} />;
}
