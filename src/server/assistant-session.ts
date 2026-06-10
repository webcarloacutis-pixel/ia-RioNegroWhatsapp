import type { AssistantProfile, AssistantTopicValue, KnowledgeEntrySummary } from "@/lib/types";

export type AssistantTurn = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type AssistantConversationContext = {
  lastTopic: AssistantTopicValue | null;
  lastTimeframe: "today" | "tomorrow" | "recent" | "none";
  conversationLanguage: "es" | "en";
  lastPlace: string | null;
  lastEntityMentioned: string | null;
  lastCategory: string | null;
  lastKnowledgeEntries: KnowledgeEntrySummary[];
  lastSuggestedItems: string[];
  recentMessages: string[];
};

type AssistantSession = {
  id: string;
  history: AssistantTurn[];
  profile: AssistantProfile;
  context: AssistantConversationContext;
};

const globalForAssistant = globalThis as unknown as {
  __rionegroAssistantSessions?: Map<string, AssistantSession>;
};

function getStore() {
  if (!globalForAssistant.__rionegroAssistantSessions) {
    globalForAssistant.__rionegroAssistantSessions = new Map();
  }

  return globalForAssistant.__rionegroAssistantSessions;
}

export function getAssistantSession(id: string) {
  const store = getStore();
  const current = store.get(id);

  if (current) {
    return current;
  }

  const session: AssistantSession = {
    id,
    history: [],
    profile: {
      zone: null,
      userType: null,
    },
    context: {
      lastTopic: null,
      lastTimeframe: "none",
      conversationLanguage: "es",
      lastPlace: null,
      lastEntityMentioned: null,
      lastCategory: null,
      lastKnowledgeEntries: [],
      lastSuggestedItems: [],
      recentMessages: [],
    },
  };

  store.set(id, session);
  return session;
}

export function addAssistantTurn(
  sessionId: string,
  role: AssistantTurn["role"],
  content: string,
) {
  const session = getAssistantSession(sessionId);
  session.history.push({
    role,
    content,
    createdAt: new Date().toISOString(),
  });
  session.history = session.history.slice(-20);
  return session;
}

export function updateAssistantProfile(sessionId: string, profile: Partial<AssistantProfile>) {
  const session = getAssistantSession(sessionId);
  session.profile = {
    zone: profile.zone?.trim() || null,
    userType: profile.userType?.trim() || null,
  };
  return session;
}

export function updateAssistantContext(
  sessionId: string,
  context: Partial<AssistantConversationContext>,
) {
  const session = getAssistantSession(sessionId);
  session.context = {
    ...session.context,
    ...context,
  };
  return session;
}

export function resetAssistantSession(sessionId: string) {
  const store = getStore();
  store.set(sessionId, {
    id: sessionId,
    history: [],
    profile: {
      zone: null,
      userType: null,
    },
    context: {
      lastTopic: null,
      lastTimeframe: "none",
      conversationLanguage: "es",
      lastPlace: null,
      lastEntityMentioned: null,
      lastCategory: null,
      lastKnowledgeEntries: [],
      lastSuggestedItems: [],
      recentMessages: [],
    },
  });
}
