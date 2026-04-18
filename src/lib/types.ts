import type {
  ANNOUNCEMENT_STATUS_VALUES,
  ASSISTANT_ROUTE_VALUES,
  ASSISTANT_TOPIC_VALUES,
  DELIVERY_MODE_VALUES,
} from "@/lib/constants";

export type AnnouncementTypeValue = string;
export type AnnouncementStatusValue = (typeof ANNOUNCEMENT_STATUS_VALUES)[number];
export type DeliveryModeValue = (typeof DELIVERY_MODE_VALUES)[number];
export type AssistantTopicValue = (typeof ASSISTANT_TOPIC_VALUES)[number];
export type AssistantRouteValue = (typeof ASSISTANT_ROUTE_VALUES)[number];

export type SegmentSummary = {
  id: string;
  name: string;
  description: string | null;
  estimatedUsers: number;
  recipientPhones: string[];
  recipientCount: number;
  activeAnnouncements: number;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AnnouncementSummary = {
  id: string;
  title: string;
  message: string;
  location: string | null;
  type: AnnouncementTypeValue;
  displayType: string;
  scheduledAt: string;
  status: AnnouncementStatusValue;
  sentAt: string | null;
  createdAt: string;
  segment: {
    id: string;
    name: string;
    estimatedUsers: number;
  } | null;
};

export type KnowledgeEntrySummary = {
  id: string;
  question: string;
  answer: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryLogSummary = {
  id: string;
  announcementId: string;
  announcementTitle: string;
  segmentName: string | null;
  mode: DeliveryModeValue;
  deliveredCount: number;
  status: "SUCCESS" | "FAILED";
  details: string | null;
  createdAt: string;
};

export type DashboardData = {
  stats: {
    users: number;
    messages: number;
    activeAnnouncements: number;
    segments: number;
  };
  messageTrend: Array<{
    label: string;
    deliveries: number;
  }>;
  typeBreakdown: Array<{
    label: string;
    value: number;
  }>;
  upcomingAnnouncements: AnnouncementSummary[];
  recentLogs: DeliveryLogSummary[];
};

export type SchedulerData = {
  scheduledAnnouncements: AnnouncementSummary[];
  recentLogs: DeliveryLogSummary[];
};

export type MetricsData = {
  totals: {
    executedMessages: number;
    deliveredUsers: number;
    demoExecutions: number;
    mostUsedType: string;
  };
  deliveryTrend: Array<{
    label: string;
    deliveries: number;
  }>;
  typeUsage: Array<{
    label: string;
    value: number;
  }>;
  segmentReach: Array<{
    label: string;
    value: number;
  }>;
  recentDemoLogs: DeliveryLogSummary[];
};

export type AssistantProfile = {
  zone: string | null;
  userType: string | null;
};

export type AssistantSourceReference = {
  type: "knowledge" | "announcement";
  title: string;
};

export type AssistantReplyMeta = {
  topic: AssistantTopicValue;
  route: AssistantRouteValue;
  usedOpenAI: boolean;
  openAIEnabled: boolean;
  sources: AssistantSourceReference[];
  profile: AssistantProfile;
};

export type AssistantChatResult = {
  reply: string;
  history: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
  meta: AssistantReplyMeta;
};

export type AssistantAnalyticsSummary = {
  totals: {
    totalQueries: number;
    todayQueries: number;
    topTopic: string;
    topQuestion: string;
  };
  topicBreakdown: Array<{
    label: string;
    value: number;
  }>;
  dailyUsage: Array<{
    label: string;
    value: number;
  }>;
  frequentQuestions: Array<{
    label: string;
    value: number;
  }>;
  recentQueries: Array<{
    message: string;
    topic: string;
    route: string;
    usedOpenAI: boolean;
    createdAt: string;
  }>;
};
