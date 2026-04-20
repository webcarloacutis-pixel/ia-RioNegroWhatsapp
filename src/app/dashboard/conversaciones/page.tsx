import { AssistantConversationsPanel } from "@/components/modules/assistant-conversations-panel";
import { getAssistantConversationThreads } from "@/server/assistant-analytics-service";

export default async function ConversationsPage() {
  const threads = await getAssistantConversationThreads();

  return <AssistantConversationsPanel threads={threads} />;
}
