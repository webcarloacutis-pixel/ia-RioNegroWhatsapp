import { SystemStatusPanel } from "@/components/modules/system-status-panel";
import { buildQaSnapshot } from "@/server/qa-service";

export const dynamic = "force-dynamic";

export default async function SystemStatusPage() {
  const snapshot = await buildQaSnapshot();

  return <SystemStatusPanel snapshot={snapshot} />;
}
