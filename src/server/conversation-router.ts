import {
  analyzeUserMessageIntent,
  type AnalyzedUserMessageIntent,
  type ConversationContext,
  type ConversationalIntent,
} from "@/server/intent-classifier";
import type { KnowledgeEntrySummary } from "@/lib/types";
import { buildOfficialKnowledgeEntries } from "@/lib/rionegro-content";
import { extractLocationFromReportText } from "@/server/citizen-report-service";
import { listKnowledgeEntries } from "@/server/panel-service";
import { getEmergencyContactReference, getEmergencyContacts } from "@/server/emergency-contacts";
import {
  UNKNOWN_OFFICIAL_DATA_REPLY,
  UNKNOWN_OFFICIAL_REPLY,
  formatWhatsAppReply,
  validateFinalAnswer,
} from "@/server/whatsapp-reply-style";

export type ConversationRouterIntent =
  | "GREETING"
  | "THANKS"
  | "SIMPLE_LOCATION"
  | "SIMPLE_HOURS"
  | "PAYMENT_OR_TAX"
  | "PROCEDURE"
  | "PQRS"
  | "DEPENDENCY_QUERY"
  | "KNOWLEDGE_BASE_QUERY"
  | "CITIZEN_REPORT"
  | "EMERGENCY_REPORT"
  | "AMBIGUOUS"
  | "OUT_OF_SCOPE"
  | "ABSURD_OR_UNKNOWN"
  | "GENERAL_CHAT";

type ExpectedAnswerShape =
  | "one_sentence"
  | "two_short_paragraphs"
  | "short_steps"
  | "clarifying_question"
  | "report_confirmation"
  | "unknown_official_info";

export type ConversationIntentAnalysis = {
  intent: ConversationRouterIntent;
  confidence: number;
  userGoal: string;
  needsKnowledgeBase: boolean;
  needsClarifyingQuestion: boolean;
  shouldCreateReport: boolean;
  shouldRefuseBecauseUnknown: boolean;
  expectedAnswerShape: ExpectedAnswerShape;
  reason: string;
  officialDataRequested: boolean;
  isReportInformationRequest: boolean;
};

export type RelevantKnowledgeItem = KnowledgeEntrySummary & {
  relevanceScore: number;
};

type KnowledgeLike = Array<
  | RelevantKnowledgeItem
  | KnowledgeEntrySummary
  | {
      title?: string;
      question?: string;
      answer?: string;
      relevanceScore?: number;
    }
  | string
>;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  "al",
  "con",
  "cual",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "es",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "mi",
  "para",
  "por",
  "que",
  "quiero",
  "se",
  "si",
  "te",
  "un",
  "una",
  "y",
]);

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function scoreTextByTokens(text: string, tokens: string[]) {
  const normalized = normalizeText(text);
  let score = 0;

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += token.length >= 6 ? 14 : 10;
    }
  }

  return score;
}

function toKnowledgeEntrySummary(
  entry: ReturnType<typeof buildOfficialKnowledgeEntries>[number],
  index: number,
): KnowledgeEntrySummary {
  return {
    id: `official-${index}`,
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    intent: null,
    shortAnswer: null,
    tags: [entry.category.toLowerCase()],
    aliases: [],
    sourceUrl: "https://rionegro.gov.co/",
    sourceName: "Sitio oficial Alcaldia de Rionegro",
    sourceType: "derived_fallback",
    isOfficial: true,
    isActive: true,
    needsReview: false,
    confidence: 0.8,
    lastVerifiedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function mergeKnowledgeSources(
  storedEntries: KnowledgeEntrySummary[],
  officialEntries: KnowledgeEntrySummary[],
) {
  const merged = new Map<string, KnowledgeEntrySummary>();

  for (const entry of [...officialEntries, ...storedEntries]) {
    merged.set(normalizeText(entry.question), entry);
  }

  return Array.from(merged.values());
}

function mapBaseIntent(
  baseIntent: ConversationalIntent,
  normalizedMessage: string,
): ConversationRouterIntent {
  if (baseIntent !== "KNOWLEDGE_BASE_QUERY" && baseIntent !== "GENERAL_MUNICIPAL_INFO") {
    return baseIntent;
  }

  if (includesAny(normalizedMessage, [/\b(pqrs|peticion|queja|reclamo|solicitud)\b/])) {
    return "PQRS";
  }

  if (includesAny(normalizedMessage, [/\b(dependencia|dependencias|secretaria|secretarias|oficina|oficinas)\b/])) {
    return "DEPENDENCY_QUERY";
  }

  if (includesAny(normalizedMessage, [/\b(horario|horarios|atienden|atencion)\b/])) {
    return "SIMPLE_HOURS";
  }

  if (includesAny(normalizedMessage, [/\b(donde|direccion|ubicacion|queda|llego|llegar)\b/])) {
    return "SIMPLE_LOCATION";
  }

  if (includesAny(normalizedMessage, [/\b(tramite|tramites|requisito|requisitos|documentos|hacer)\b/])) {
    return "PROCEDURE";
  }

  return baseIntent === "GENERAL_MUNICIPAL_INFO" ? "GENERAL_CHAT" : "KNOWLEDGE_BASE_QUERY";
}

function getExpectedAnswerShape(
  intent: ConversationRouterIntent,
  analysis: AnalyzedUserMessageIntent,
): ExpectedAnswerShape {
  if (analysis.shouldAskClarifyingQuestion || intent === "AMBIGUOUS") {
    return "clarifying_question";
  }

  if (analysis.shouldCreateCitizenReport) {
    return "report_confirmation";
  }

  if (analysis.shouldRefuseBecauseUnknown) {
    return "unknown_official_info";
  }

  if (intent === "PROCEDURE" || intent === "PAYMENT_OR_TAX" || intent === "PQRS") {
    return "short_steps";
  }

  if (intent === "SIMPLE_LOCATION" || intent === "SIMPLE_HOURS" || intent === "GREETING" || intent === "THANKS") {
    return "one_sentence";
  }

  return "two_short_paragraphs";
}

function toConversationIntentAnalysis(
  message: string,
  analysis: AnalyzedUserMessageIntent,
): ConversationIntentAnalysis {
  const normalizedMessage = normalizeText(message);
  const intent = mapBaseIntent(analysis.intent, normalizedMessage);

  return {
    intent,
    confidence: analysis.confidence,
    userGoal: normalizedMessage || "Sin texto suficiente.",
    needsKnowledgeBase: analysis.shouldUseKnowledgeBase,
    needsClarifyingQuestion: analysis.shouldAskClarifyingQuestion,
    shouldCreateReport: analysis.shouldCreateCitizenReport,
    shouldRefuseBecauseUnknown: analysis.shouldRefuseBecauseUnknown,
    expectedAnswerShape: getExpectedAnswerShape(intent, analysis),
    reason: analysis.reason,
    officialDataRequested: analysis.officialDataRequested,
    isReportInformationRequest: analysis.isReportInformationRequest,
  };
}

function getKnowledgeText(entry: unknown) {
  if (typeof entry === "string") {
    return entry;
  }

  if (entry && typeof entry === "object") {
    const value = entry as {
      title?: string;
      question?: string;
      answer?: string;
      category?: string;
    };

    return [value.title, value.question, value.answer, value.category].filter(Boolean).join(" ");
  }

  return "";
}

function getBestKnowledgeScore(items: KnowledgeLike, userMessage: string) {
  const tokens = tokenize(userMessage);

  return items.reduce((bestScore, item) => {
    if (typeof item !== "string" && item && typeof item === "object" && "relevanceScore" in item) {
      const relevanceScore = Number(item.relevanceScore ?? 0);
      return Math.max(bestScore, Number.isFinite(relevanceScore) ? relevanceScore : 0);
    }

    return Math.max(bestScore, scoreTextByTokens(getKnowledgeText(item), tokens));
  }, 0);
}

export function analyzeConversationIntent(input: {
  userMessage: string;
  conversationHistory?: Array<{ role?: string; content?: string }>;
  hasImage?: boolean;
  hasAudio?: boolean;
  transcription?: string;
}): ConversationIntentAnalysis {
  const effectiveMessage = (input.transcription || input.userMessage || "").trim();
  const context: ConversationContext = {
    hasImage: input.hasImage,
    messageType: input.hasImage ? "image" : input.hasAudio ? "audio" : "chat",
    lastTopic: input.conversationHistory?.at(-1)?.content ?? null,
  };
  const baseAnalysis = analyzeUserMessageIntent(effectiveMessage, context);
  const analysis = toConversationIntentAnalysis(effectiveMessage, baseAnalysis);

  console.log("[conversation] intent analyzed", {
    intent: analysis.intent,
    confidence: analysis.confidence,
    needsKnowledgeBase: analysis.needsKnowledgeBase,
    shouldCreateReport: analysis.shouldCreateReport,
    reason: analysis.reason,
  });

  if (analysis.shouldRefuseBecauseUnknown) {
    console.log("[conversation] out of scope", {
      intent: analysis.intent,
      reason: analysis.reason,
    });
  }

  if (analysis.needsClarifyingQuestion) {
    console.log("[conversation] ambiguous question", {
      intent: analysis.intent,
      reason: analysis.reason,
    });
  }

  return analysis;
}

export async function retrieveRelevantKnowledge(input: {
  userMessage: string;
  intent: ConversationRouterIntent | ConversationalIntent;
  maxItems?: number;
}): Promise<RelevantKnowledgeItem[]> {
  const maxItems = Math.max(1, input.maxItems ?? 3);
  const tokens = tokenize(input.userMessage);

  if (!tokens.length) {
    console.log("[conversation] knowledge retrieved", {
      intent: input.intent,
      count: 0,
      reason: "empty_query",
    });
    return [];
  }

  const officialEntries = buildOfficialKnowledgeEntries().map(toKnowledgeEntrySummary);
  const storedEntries = await listKnowledgeEntries();
  const entries = mergeKnowledgeSources(storedEntries, officialEntries);
  const ranked = entries
    .map((entry) => {
      const relevanceScore =
        scoreTextByTokens(entry.question, tokens) * 3 +
        scoreTextByTokens(entry.answer, tokens) +
        scoreTextByTokens(entry.category, tokens);

      return {
        ...entry,
        relevanceScore,
      };
    })
    .filter((entry) => entry.relevanceScore >= 20)
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, maxItems);

  console.log("[conversation] knowledge retrieved", {
    intent: input.intent,
    count: ranked.length,
    bestScore: ranked[0]?.relevanceScore ?? 0,
  });

  return ranked;
}

export function validateKnowledgeGrounding(input: {
  userMessage: string;
  intent: ConversationRouterIntent | ConversationalIntent;
  retrievedKnowledge: KnowledgeLike;
}) {
  const analysis = analyzeConversationIntent({ userMessage: input.userMessage });
  const officialDataIntent =
    analysis.officialDataRequested ||
    [
      "SIMPLE_LOCATION",
      "SIMPLE_HOURS",
      "PAYMENT_OR_TAX",
      "PROCEDURE",
      "PQRS",
      "DEPENDENCY_QUERY",
      "KNOWLEDGE_BASE_QUERY",
    ].includes(String(input.intent));
  const bestScore = getBestKnowledgeScore(input.retrievedKnowledge, input.userMessage);
  const hasEnoughEvidence = !officialDataIntent || (input.retrievedKnowledge.length > 0 && bestScore >= 20);

  if (!hasEnoughEvidence) {
    console.log("[conversation] insufficient knowledge", {
      intent: input.intent,
      bestScore,
      reason: "La pregunta requiere dato oficial y no hay evidencia suficiente.",
    });
  }

  return {
    hasEnoughEvidence,
    confidence: hasEnoughEvidence ? Math.min(0.98, 0.5 + bestScore / 100) : 0.2,
    reason: hasEnoughEvidence
      ? "Hay evidencia oficial suficiente para responder."
      : "No hay informacion oficial suficiente para responder.",
  };
}

export function generateGroundedAnswer(input: {
  userMessage: string;
  intent: ConversationRouterIntent | ConversationalIntent;
  retrievedKnowledge: RelevantKnowledgeItem[];
}) {
  const grounding = validateKnowledgeGrounding({
    userMessage: input.userMessage,
    intent: input.intent,
    retrievedKnowledge: input.retrievedKnowledge,
  });

  if (!grounding.hasEnoughEvidence) {
    return UNKNOWN_OFFICIAL_DATA_REPLY;
  }

  const answer = input.retrievedKnowledge[0]?.answer ?? UNKNOWN_OFFICIAL_DATA_REPLY;
  const groundingSources = input.retrievedKnowledge.map((item) => ({
    title: item.question,
    type: item.category,
  }));
  const validation = validateFinalAnswer({
    userMessage: input.userMessage,
    answer,
    intent: input.intent as ConversationalIntent,
    retrievedKnowledge: groundingSources,
    officialDataRequested: true,
  });

  if (validation.shouldRewrite) {
    console.log("[conversation] final answer rewritten", {
      reason: validation.reason,
    });
  }

  return formatWhatsAppReply({
    reply: answer,
    intent: input.intent as ConversationalIntent,
    userMessage: input.userMessage,
    sourceConfidence: grounding.confidence,
  });
}

export function buildClarifyingQuestion(message: string) {
  const normalized = normalizeText(message);

  if (/(perro|gato|mascota)/.test(normalized) && /(ayuda|urgente|emergencia|herido)/.test(normalized)) {
    return "Entiendo. Es una emergencia con tu mascota o quieres registrar una alerta ciudadana? Si es una alerta, dime que paso y en que sector.";
  }

  if (/(impuesto|impuestos|pago|pagos|rentas)/.test(normalized)) {
    return "Claro. Te refieres al impuesto predial, industria y comercio u otro pago?";
  }

  if (/(tramite|tramites)/.test(normalized)) {
    return "Claro. Que tramite necesitas hacer?";
  }

  if (/hueco/.test(normalized) && /(denuncia|reporte|reportar|reporto)/.test(normalized)) {
    return "Claro. Cuentame donde esta el hueco y, si puedes, envia una foto para registrarlo correctamente.";
  }

  if (/(olor raro|problema|algo paso|vi algo peligroso|necesito ayuda)/.test(normalized)) {
    return "Entiendo. Quieres que registre esto como alerta ciudadana? Si es asi, dime que paso, el sector exacto y envia una foto si puedes.";
  }

  if (/(denuncia|reporte|reportar)/.test(normalized)) {
    return "Claro. Cuentame que paso y en que sector para poder registrar el reporte.";
  }

  return "Claro. Me cuentas un poco mas para poder orientarte bien?";
}

function buildLocationPhrase(location: string) {
  const normalizedLocation = normalizeText(location);

  if (normalizedLocation.startsWith("via ")) {
    return `en la ${location}`;
  }

  if (normalizedLocation.startsWith("parque") || normalizedLocation.startsWith("hospital")) {
    return `en el ${location}`;
  }

  if (normalizedLocation.startsWith("colegio")) {
    return `en el ${location}`;
  }

  return `en el sector de ${location}`;
}

function getReportSubject(analysis: AnalyzedUserMessageIntent) {
  const normalizedCategory = normalizeText(analysis.reason);

  if (normalizedCategory.includes("accidente") || normalizedCategory.includes("choque")) {
    return "el accidente";
  }

  if (normalizedCategory.includes("animal")) {
    return "el reporte de animal herido";
  }

  if (normalizedCategory.includes("incendio")) {
    return "el incendio";
  }

  if (normalizedCategory.includes("seguridad")) {
    return "la alerta de seguridad";
  }

  if (normalizedCategory.includes("fuga de gas")) {
    return "la fuga de gas";
  }

  if (normalizedCategory.includes("inundacion")) {
    return "la inundacion";
  }

  if (normalizedCategory.includes("derrumbe") || normalizedCategory.includes("deslizamiento")) {
    return "el derrumbe";
  }

  if (normalizedCategory.includes("arbol")) {
    return "el caso de arbol caido";
  }

  return "el caso";
}

export function buildCitizenReportAssistantPrompt(
  analysis: AnalyzedUserMessageIntent,
  message = "",
) {
  const location = extractLocationFromReportText(message);

  if (analysis.intent === "EMERGENCY_REPORT") {
    if (!location) {
      return [
        "Gracias por avisar. Registramos el reporte como posible situacion urgente para revision.",
        "",
        `Dime por favor la ubicacion exacta o el sector donde ocurre. Si puedes, envia tambien una foto del lugar. Si hay personas heridas o riesgo inmediato, comunicate tambien con ${getEmergencyContactReference()}.`,
      ].join("\n");
    }

    if (normalizeText(analysis.reason).includes("accidente")) {
      return [
        `Gracias por reportarlo. Ya registramos el accidente ${buildLocationPhrase(location)} para revision.`,
        "",
        `Si puedes, envianos una foto del lugar o un punto de referencia mas exacto. Si hay personas heridas o riesgo inmediato, comunicate tambien con ${getEmergencyContactReference()}.`,
      ].join("\n");
    }

    return [
      `Gracias por avisar. Registramos ${getReportSubject(analysis)} ${buildLocationPhrase(location)} como posible situacion urgente.`,
      "",
      `Si puedes, envianos una foto del lugar o un punto de referencia mas exacto. Si hay personas heridas o riesgo inmediato, comunicate tambien con ${getEmergencyContactReference()}.`,
    ].join("\n");
  }

  if (location) {
    return [
      `Gracias por reportarlo. Ya registramos ${getReportSubject(analysis)} ${buildLocationPhrase(location)} para revision.`,
      "",
      "Si puedes, envianos una foto del lugar o un punto de referencia mas exacto.",
    ].join("\n");
  }

  return "Gracias por reportarlo. Para registrarlo bien, dime por favor la ubicacion exacta o el sector donde ocurrio. Si puedes, envia tambien una foto del lugar.";
}

export function getPreAssistantReply(
  message: string,
  analysis: AnalyzedUserMessageIntent,
) {
  if (analysis.intent === "THANKS") {
    return "Con mucho gusto.";
  }

  if (analysis.intent === "GREETING") {
    return "Hola! En que te puedo ayudar hoy?";
  }

  if (analysis.shouldRefuseBecauseUnknown) {
    return UNKNOWN_OFFICIAL_REPLY;
  }

  if (analysis.shouldAskClarifyingQuestion) {
    return buildClarifyingQuestion(message);
  }

  if (analysis.shouldCreateCitizenReport) {
    return buildCitizenReportAssistantPrompt(analysis, message);
  }

  return null;
}

export function routeConversationBeforeAssistant(
  message: string,
  context?: ConversationContext,
) {
  const analysis = analyzeUserMessageIntent(message, context);
  const routerAnalysis = toConversationIntentAnalysis(message, analysis);

  console.log("[conversation] intent analyzed", {
    intent: routerAnalysis.intent,
    confidence: routerAnalysis.confidence,
    needsKnowledgeBase: routerAnalysis.needsKnowledgeBase,
    shouldCreateReport: routerAnalysis.shouldCreateReport,
    reason: routerAnalysis.reason,
  });

  if (routerAnalysis.shouldRefuseBecauseUnknown) {
    console.log("[conversation] out of scope", {
      intent: routerAnalysis.intent,
      reason: routerAnalysis.reason,
    });
  }

  if (routerAnalysis.needsClarifyingQuestion) {
    console.log("[conversation] ambiguous question", {
      intent: routerAnalysis.intent,
      reason: routerAnalysis.reason,
    });
  }

  return {
    analysis,
    routerAnalysis,
    reply: getPreAssistantReply(message, analysis),
  };
}

export { getEmergencyContactReference, getEmergencyContacts };
