import { KnowledgeManager } from "@/components/modules/knowledge-manager";
import { listKnowledgeEntries } from "@/server/panel-service";

export default async function KnowledgePage() {
  const entries = await listKnowledgeEntries();
  return <KnowledgeManager entries={entries} />;
}
