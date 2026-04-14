import { SegmentsManager } from "@/components/modules/segments-manager";
import { listSegments } from "@/server/panel-service";

export default async function SegmentsPage() {
  const segments = await listSegments();
  return <SegmentsManager segments={segments} />;
}
