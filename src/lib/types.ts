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

export type CitizenReportStatus =
  | "pending"
  | "reviewing"
  | "approved"
  | "rejected"
  | "converted_to_mass_message"
  | "attended"
  | "resolved";

export type CitizenReportPriority = "low" | "normal" | "high" | "urgent";

export type CitizenReportImageSummary = {
  id: string;
  url: string;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

export type CitizenReportSummary = {
  id: string;
  title: string | null;
  description: string;
  type: string;
  category: string | null;
  priority: CitizenReportPriority;
  status: CitizenReportStatus;
  location: string | null;
  address: string | null;
  neighborhood: string | null;
  source: string;
  reporterPhone: string | null;
  reporterName: string | null;
  whatsappMessageId: string | null;
  whatsappFrom: string | null;
  whatsappRawType: string | null;
  images: CitizenReportImageSummary[];
  adminNotes: string | null;
  massMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
};

export type CitizenReportListResult = {
  reports: CitizenReportSummary[];
  summary: {
    total: number;
    pending: number;
    urgent: number;
  };
};

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
  imageUrl: string | null;
  imagePublicId: string | null;
  imageFilename: string | null;
  imageMimeType: string | null;
  imageSize: number | null;
  imageProvider: string | null;
  audioUrl: string | null;
  audioPublicId: string | null;
  audioFilename: string | null;
  audioMimeType: string | null;
  audioSize: number | null;
  audioDuration: number | null;
  audioProvider: string | null;
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
  questionEn?: string | null;
  answerEn?: string | null;
  shortAnswerEn?: string | null;
  aliasesEn?: string[];
  tagsEn?: string[];
  translatedToEnglishAt?: string | null;
  category: string;
  intent: string | null;
  shortAnswer: string | null;
  tags: string[];
  aliases: string[];
  sourceUrl: string | null;
  sourceName: string | null;
  sourceType: string;
  isOfficial: boolean;
  isActive: boolean;
  needsReview: boolean;
  confidence: number;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeConflictSummary = {
  id: string;
  topic: string;
  category: string | null;
  values: unknown;
  sourceUrls: string[];
  status: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type KnowledgeFacet = {
  label: string;
  value: string;
  count: number;
};

export type KnowledgeDashboardSummary = {
  total: number;
  active: number;
  inactive: number;
  needsReview: number;
  official: number;
  lowConfidence: number;
  categories: number;
  sources: number;
  lastUpdatedAt: string | null;
};

export type KnowledgeListResult = {
  items: KnowledgeEntrySummary[];
  pagination: KnowledgePagination;
  facets: {
    categories: KnowledgeFacet[];
    intents: KnowledgeFacet[];
    sources: KnowledgeFacet[];
    tags: KnowledgeFacet[];
  };
  summary: KnowledgeDashboardSummary;
  conflicts: KnowledgeConflictSummary[];
  fallback: boolean;
};

export type KnowledgeTestAnswerResult = {
  answer: string;
  usedItems: Array<KnowledgeEntrySummary & { score?: number; matchedBy?: string[] }>;
  confidence: number;
  wouldSayUnknown: boolean;
  detectedLanguage: "es" | "en";
  answerLanguage: "es" | "en";
  usedSpanishKnowledge: boolean;
  knowledgeSource: "db" | "cache";
  strategy: string;
  usedMemory: boolean;
  topScore: number;
  queryNormalized: string;
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

export type ChannelRuntimeStatus = {
  mode: "real" | "blocked" | "simulated" | "unconfigured";
  label: string;
  description: string;
  badgeTone: "info" | "success" | "warning" | "danger";
  safeMode: boolean;
  dryRun: boolean;
  ultramsgMock: boolean;
  simulationMode: boolean;
  ultraMsgConfigured: boolean;
  defaultRecipientConfigured: boolean;
  schedulerEnabled: boolean;
  segmentsWithRecipients: number;
  hasRecipientSource: boolean;
  realSendingReady: boolean;
};

export type SchedulerRunSummary = {
  id: string | null;
  source: string;
  startedAt: string | null;
  completedAt: string | null;
  dueCount: number;
  lockedCount: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  simulatedCount: number;
  skippedCount: number;
  details: string | null;
};

export type SchedulerRunResult = {
  source: string;
  startedAt: string;
  completedAt: string;
  dueCount: number;
  lockedCount: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  simulatedCount: number;
  skippedCount: number;
  processed: DeliveryLogSummary[];
};

export type SchedulerStatus = {
  schedulerEnabled: boolean;
  workerExpected: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  lastRun: SchedulerRunSummary | null;
  pendingScheduled: number;
  overdueScheduled: number;
  serverTimeUtc: string;
  serverTimeBogota: string;
  safeMode: boolean;
  dryRun: boolean;
  ultramsgMock: boolean;
  hasDefaultRecipient: boolean;
};

export type DashboardData = {
  stats: {
    users: number;
    messages: number;
    activeAnnouncements: number;
    segments: number;
  };
  channelStatus: ChannelRuntimeStatus;
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
  status: SchedulerStatus;
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

export type AssistantInstitutionalIntentValue =
  | "consulta_informativa"
  | "tramite"
  | "horario"
  | "ubicacion"
  | "pago"
  | "servicio"
  | "emergencia"
  | "denuncia"
  | "reporte_ciudadano"
  | "comunicado_admin"
  | "agendamiento"
  | "desconocido";

export type AssistantReplyMeta = {
  topic: AssistantTopicValue;
  route: AssistantRouteValue;
  institutionalIntent: AssistantInstitutionalIntentValue;
  language: "es" | "en";
  languageConfidence: number;
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

export type AssistantConversationExchange = {
  id: string;
  userMessage: string;
  assistantReply: string;
  topic: string;
  route: string;
  createdAt: string;
};

export type AssistantConversationThread = {
  sessionId: string;
  title: string;
  phoneNumber: string | null;
  channel: "WHATSAPP" | "PANEL";
  exchangeCount: number;
  messageCount: number;
  lastMessage: string;
  lastActivityAt: string;
  exchanges: AssistantConversationExchange[];
};

export type QaTestStatus = "PASS" | "FAIL" | "WARNING";

export type QaScenario = {
  id: string;
  category: string;
  title: string;
  description: string;
  input: string;
  expectedBehavior: string;
  expectedIntent?: string;
  expectedLanguage?: "es" | "en";
  expectedShouldCreateAlert?: boolean;
  expectedAlertCategory?: string;
  expectedAlertPriority?: CitizenReportPriority;
  expectedAlertLocation?: string;
  expectedAskedConfirmation?: boolean;
  expectedUsedKnowledgeBase?: boolean;
  expectedKeywords?: string[];
  acceptableKeywords?: string[][];
  forbiddenKeywords?: string[];
  requiredConcepts?: string[];
  forbiddenConcepts?: string[];
  expectedSafetyBehavior?: "refuse_private_data" | "refuse_prompt_injection" | "none";
  allowForbiddenKeywordIfNegated?: boolean;
  mustBeShort?: boolean;
  mustNotUseBullets?: boolean;
  mustMentionLocationIfProvided?: boolean;
  mustPreserveTopic?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QaHallucinationFinding = {
  inventedLinks: string[];
  inventedEmails: string[];
  inventedPhones: string[];
  inventedAddresses: string[];
  inventedHours: string[];
};

export type QaScenarioResult = {
  id: string;
  scenarioId: string;
  runId: string;
  caseTitle: string;
  category: string;
  status: QaTestStatus;
  score: number;
  responseTimeMs: number;
  input: string;
  botReply: string;
  expectedBehavior: string;
  detectedIntent?: string;
  detectedLanguage?: "es" | "en";
  shouldCreateAlert?: boolean;
  alertCategory?: string | null;
  alertPriority?: CitizenReportPriority | null;
  extractedLocation?: string | null;
  usedKnowledgeBase?: boolean;
  askedConfirmation?: boolean;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  matchedAcceptableGroups: string[][];
  missingAcceptableGroups: string[][];
  matchedConcepts: string[];
  missingConcepts: string[];
  detectedForbiddenKeywords: string[];
  hallucinations: QaHallucinationFinding;
  differences: string[];
  failureReason: string | null;
  createdAt: string;
  wasRegression: boolean;
};

export type QaCategoryMetric = {
  category: string;
  total: number;
  pass: number;
  fail: number;
  warning: number;
  percentage: number;
};

export type QaRunSummary = {
  runId: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  passRate: number;
  confidenceScore: number;
  averageResponseTimeMs: number;
  lastRun: string | null;
  hallucinationCount: number;
  regressionCount: number;
};

export type QaRunRecord = {
  id: string;
  createdAt: string;
  durationMs: number;
  summary: QaRunSummary;
  categoryMetrics: QaCategoryMetric[];
  results: QaScenarioResult[];
};

export type QaChartPoint = {
  label: string;
  value: number;
  pass?: number;
  fail?: number;
  warning?: number;
  responseMs?: number;
};

export type QaDashboardData = {
  scenarios: QaScenario[];
  summary: QaRunSummary;
  categoryMetrics: QaCategoryMetric[];
  latestResults: QaScenarioResult[];
  history: QaRunRecord[];
  regressions: QaScenarioResult[];
  hallucinations: {
    total: number;
    links: number;
    emails: number;
    phones: number;
    addresses: number;
    hours: number;
  };
  charts: {
    passRateByCategory: QaChartPoint[];
    historicalEvolution: QaChartPoint[];
    responseTimeTrend: QaChartPoint[];
    errorDistribution: QaChartPoint[];
    weeklyTrend: QaChartPoint[];
  };
};
