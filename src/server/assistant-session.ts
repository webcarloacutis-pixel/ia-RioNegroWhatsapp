import type {
  AssistantProfile,
  AssistantTopicValue,
  KnowledgeEntrySummary,
  PendingCitizenReportMemory,
} from "@/lib/types";

const ASSISTANT_SESSION_HISTORY_LIMIT = 10;

export type AssistantTurn = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AssistantConversationContext = {
  lastTopic: AssistantTopicValue | null;
  lastTimeframe: "today" | "tomorrow" | "recent" | "none";
  conversationLanguage: "es" | "en";
  lastPlace: string | null;
  lastEntityMentioned: string | null;
  lastCategory: string | null;
  lastKnowledgeEntries: KnowledgeEntrySummary[];
  lastSuggestedItems: string[];
  pendingCitizenReport: PendingCitizenReportMemory | null;
  recentMessages: string[];
};

export type AssistantSession = {
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

function buildDefaultContext(): AssistantConversationContext {
  return {
    lastTopic: null,
    lastTimeframe: "none",
    conversationLanguage: "es",
    lastPlace: null,
    lastEntityMentioned: null,
    lastCategory: null,
    lastKnowledgeEntries: [],
    lastSuggestedItems: [],
    pendingCitizenReport: null,
    recentMessages: [],
  };
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
    context: buildDefaultContext(),
  };

  store.set(id, session);
  return session;
}

export function hydrateAssistantSession(
  sessionId: string,
  snapshot: {
    history?: AssistantTurn[];
    context?: Partial<AssistantConversationContext>;
    profile?: Partial<AssistantProfile>;
  },
) {
  const store = getStore();
  const current = getAssistantSession(sessionId);
  const nextSession: AssistantSession = {
    id: sessionId,
    history: (snapshot.history ?? current.history).slice(-ASSISTANT_SESSION_HISTORY_LIMIT),
    profile: {
      zone: snapshot.profile?.zone?.trim() || current.profile.zone,
      userType: snapshot.profile?.userType?.trim() || current.profile.userType,
    },
    context: {
      ...buildDefaultContext(),
      ...current.context,
      ...snapshot.context,
      lastKnowledgeEntries:
        snapshot.context?.lastKnowledgeEntries ?? current.context.lastKnowledgeEntries,
      lastSuggestedItems:
        snapshot.context?.lastSuggestedItems ?? current.context.lastSuggestedItems,
      recentMessages: (
        snapshot.context?.recentMessages ?? current.context.recentMessages
      ).slice(-3),
    },
  };

  store.set(sessionId, nextSession);
  return nextSession;
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
  session.history = session.history.slice(-ASSISTANT_SESSION_HISTORY_LIMIT);
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
    context: buildDefaultContext(),
  });
}
