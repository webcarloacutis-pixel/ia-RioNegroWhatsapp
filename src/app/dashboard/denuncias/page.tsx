import { CitizenReportsManager } from "@/components/modules/citizen-reports-manager";
import { listCitizenReports } from "@/server/citizen-report-service";

export default async function CitizenReportsPage() {
  const data = await listCitizenReports({ limit: 100 });

  return <CitizenReportsManager initialData={data} />;
}
