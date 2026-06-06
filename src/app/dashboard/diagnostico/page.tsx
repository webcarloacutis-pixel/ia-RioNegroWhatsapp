import { DiagnosticsPanel } from "@/components/modules/diagnostics-panel";
import { getDiagnosticsOverview } from "@/server/diagnostics-service";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const diagnostics = await getDiagnosticsOverview();

  return <DiagnosticsPanel initialData={diagnostics} />;
}
