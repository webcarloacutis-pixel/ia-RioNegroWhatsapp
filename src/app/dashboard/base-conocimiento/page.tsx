import { KnowledgeManager } from "@/components/modules/knowledge-manager";
import { listKnowledgeDashboard } from "@/server/panel-service";

export default async function KnowledgePage() {
  const initialData = await listKnowledgeDashboard();
  return <KnowledgeManager initialData={initialData} />;
}
