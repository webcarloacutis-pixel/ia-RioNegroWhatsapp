import { buildOfficialKnowledgeEntries, institutionalServices } from "@/lib/rionegro-content";
import { officialPlaces } from "@/lib/rionegro-places";
import { analyzeCitizenAlertIntent } from "@/server/citizen-report-service";

export type ConversationalIntent =
  | "OUT_OF_SCOPE"
  | "ABSURD_OR_UNKNOWN"
  | "GENERAL_MUNICIPAL_INFO"
  | "KNOWLEDGE_BASE_QUERY"
  | "CITIZEN_REPORT"
  | "EMERGENCY_REPORT"
  | "PAYMENT_OR_TAX"
  | "AMBIGUOUS"
  | "GREETING"
  | "THANKS";

export type InstitutionalConversationIntent =
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

export type ConversationContext = {
  lastIntent?: ConversationalIntent | null;
  lastTopic?: string | null;
  messageType?: string;
  hasImage?: boolean;
};

export type AnalyzedUserMessageIntent = {
  intent: ConversationalIntent;
  institutionalIntent: InstitutionalConversationIntent;
  confidence: number;
  shouldUseKnowledgeBase: boolean;
  shouldCreateCitizenReport: boolean;
  shouldAskClarifyingQuestion: boolean;
  shouldRefuseBecauseUnknown: boolean;
  reason: string;
  officialDataRequested: boolean;
  isReportInformationRequest: boolean;
};

const MUNICIPAL_SCOPE_HINTS = [
  "alcaldia",
  "rionegro",
  "municipio",
  "municipal",
  "tramite",
  "tramites",
  "servicio",
  "servicios",
  "pago",
  "pagos",
  "predial",
  "industria y comercio",
  "ica",
  "impuesto",
  "impuestos",
  "rentas",
  "hacienda",
  "pqrs",
  "queja",
  "peticion",
  "solicitud",
  "dependencia",
  "dependencias",
  "secretaria",
  "secretarias",
  "horario",
  "ubicacion",
  "direccion",
  "telefono",
  "correo",
  "canal oficial",
  "denuncia",
  "denunciar",
  "reporte",
  "reportar",
  "alerta",
  "emergencia",
  "transito",
  "movilidad",
  "accidente",
  "choque",
  "comparendo",
  "catastro",
  "comunicado",
  "noticia",
  "evento",
  "alcalde",
  "sede",
  "oficina",
  "restaurante",
  "restaurantes",
  "hotel",
  "hoteles",
  "museo",
  "museos",
  "turismo",
  "comercio",
  "comercios",
  "veterinaria",
  "veterinario",
  "mecanico",
  "mecanica",
  "taller",
  "talleres",
  "carro",
  "vehiculo",
  "city hall",
  "mayor's office",
  "municipality",
  "municipal office",
  "procedure",
  "procedures",
  "service",
  "services",
  "tax",
  "taxes",
  "property tax",
  "payment",
  "payments",
  "complaint",
  "request",
  "petition",
  "office",
  "opening hours",
  "schedule",
  "address",
  "phone",
  "report",
  "incident",
  "emergency",
  "traffic",
  "mobility",
  "accident",
  "fire",
  "pothole",
  "flood",
  "weather",
  "restaurant",
  "hotel",
  "museum",
  "tourism",
  "business",
  "shop",
  "veterinary",
  "vet",
  "mechanic",
  "workshop",
  "car",
  "vehicle",
];

const OFFICIAL_DATA_HINTS = [
  "donde",
  "direccion",
  "ubicacion",
  "queda",
  "horario",
  "telefono",
  "correo",
  "email",
  "requisitos",
  "documentos",
  "tramite",
  "tramites",
  "pago",
  "pagos",
  "predial",
  "comparendo",
  "pqrs",
  "dependencia",
  "secretaria",
  "oficina",
  "canal",
  "enlace",
  "link",
  "pasaporte",
  "restaurante",
  "restaurantes",
  "hotel",
  "hoteles",
  "museo",
  "museos",
  "turismo",
  "comercio",
  "comercios",
  "veterinaria",
  "veterinario",
  "mecanico",
  "mecanica",
  "taller",
  "talleres",
  "carro",
  "vehiculo",
  "where",
  "address",
  "location",
  "opening hours",
  "business hours",
  "schedule",
  "what time",
  "phone",
  "email",
  "requirements",
  "documents",
  "procedure",
  "procedures",
  "payment",
  "payments",
  "property tax",
  "traffic ticket",
  "office",
  "channel",
  "link",
  "weather",
  "restaurant",
  "hotel",
  "museum",
  "tourism",
  "business",
  "shop",
  "veterinary",
  "vet",
  "mechanic",
  "workshop",
  "car",
  "vehicle",
];

const PAYMENT_HINTS = [
  "predial",
  "industria y comercio",
  "ica",
  "impuesto",
  "impuestos",
  "rentas",
  "hacienda",
  "pago",
  "pagos",
  "pagar",
  "comparendo",
  "valorizacion",
  "tax",
  "taxes",
  "property tax",
  "municipal taxes",
  "treasury",
  "payment",
  "payments",
  "pay",
  "traffic ticket",
];

const AMBIGUOUS_TAX_HINTS = [
  "impuestos",
  "impuesto",
  "pagos",
  "pago",
  "rentas",
  "taxes",
  "tax",
  "payments",
  "payment",
];

const ABSURD_OR_OUT_OF_SCOPE_HINTS = [
  "empanada interdimensional",
  "empanadas interdimensionales",
  "interdimensional",
  "extraterrestre",
  "extraterrestres",
  "dragon",
  "dragones",
  "batman",
  "goku",
  "gato naranja",
  "pelos tiene un gato",
  "alcalde es un robot",
  "es un robot",
  "robot",
  "criptomoneda",
  "bitcoin",
  "ethereum",
  "mejor cripto",
  "pelea entre",
  "quien gana una pelea",
  "horoscopo",
  "receta",
  "apuesta",
  "loteria",
];

const REPORT_INFO_REQUEST_PATTERNS = [
  /^(?:como|donde|que|cual|puedo|debo|necesito saber|quiero saber|me puedes decir)\b.*\b(?:denuncia|denunciar|reporte|reportar|reporto)\b/,
  /^(?:como|que)\s+hago\b.*\b(?:denuncia|denunciar|reporte|reportar|hueco|accidente|choque)\b/,
  /^(?:donde|como)\b.*\b(?:transito|movilidad|inspeccion|policia|fiscalia)\b/,
  /^(?:how|where|what|can|could|should|i need to know|please tell me)\b.*\b(?:complaint|report|reporting|incident|pothole|accident|crash)\b/,
  /^how\s+(?:can|do)\s+i\s+report\b/,
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()[\]{}"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeText(value)));
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function isGreeting(text: string) {
  const match = text.match(
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello|hi)\b/,
  );

  if (!match) return false;

  return text.slice(match[0].length).trim() === "";
}

type IntentAnalysisCore = Omit<AnalyzedUserMessageIntent, "institutionalIntent">;

export function classifyIntent(
  message: string,
  context: ConversationContext = {},
  analysis?: Partial<IntentAnalysisCore>,
): InstitutionalConversationIntent {
  const normalized = normalizeText(message);

  if (!normalized) {
    return context.hasImage || context.messageType === "image" ? "reporte_ciudadano" : "desconocido";
  }

  if (
    /\b(comunicado|comunicados|mensaje masivo|mensajes masivos|difusion|campana|campana institucional|broadcast)\b/.test(
      normalized,
    )
  ) {
    return /\b(programar|programado|agendar|agenda|fecha|hora|scheduled|schedule)\b/.test(
      normalized,
    )
      ? "agendamiento"
      : "comunicado_admin";
  }

  if (analysis?.shouldCreateCitizenReport || analysis?.intent === "EMERGENCY_REPORT") {
    if (
      /\b(emergencia|urgencia|urgente|accidente|choque|incendio|disparos|balacera|fuga de gas|herido|heridos|ambulancia|explosion|derrumbe|deslizamiento|emergency|accident|fire|gunshots|gas leak|injured)\b/.test(
        normalized,
      )
    ) {
      return "emergencia";
    }

    if (/\b(denuncia|denunciar|queja|abuso|robo|hurto|complaint|crime)\b/.test(normalized)) {
      return "denuncia";
    }

    return "reporte_ciudadano";
  }

  if (analysis?.isReportInformationRequest) {
    return /\b(denuncia|denunciar|queja|complaint)\b/.test(normalized)
      ? "denuncia"
      : "reporte_ciudadano";
  }

  if (/\b(predial|impuesto|impuestos|pago|pagos|pagar|rentas|hacienda|comparendo|valorizacion|property tax|tax|taxes|payment|pay|traffic ticket)\b/.test(normalized)) {
    return "pago";
  }

  if (/\b(horario|horarios|atiende|atienden|atencion|abre|cierra|opening hours|business hours|schedule|what time)\b/.test(normalized)) {
    return "horario";
  }

  if (/\b(tramite|tramites|requisito|requisitos|documentos|proceso|licencia|procedure|procedures|paperwork|requirements|documents)\b/.test(normalized)) {
    return "tramite";
  }

  if (
    /\b(veterinaria|veterinario|farmacia|drogueria|taxi|grua|hotel|restaurante|comercio|comercios|negocio|mecanico|mecanica|taller|talleres|carro|vehiculo|clinica|hospital|servicio|servicios|dependencia|secretaria|oficina|vet|veterinary|pharmacy|restaurant|business|shop|mechanic|workshop|car|vehicle|clinic|service|office)\b/.test(
      normalized,
    )
  ) {
    return "servicio";
  }

  if (/\b(donde|direccion|ubicacion|queda|llego|llegar|sede|where|address|location|city hall|mayor's office)\b/.test(normalized)) {
    return "ubicacion";
  }

  if (analysis?.shouldUseKnowledgeBase || analysis?.officialDataRequested) {
    return "consulta_informativa";
  }

  return "desconocido";
}

function withInstitutionalIntent(
  message: string,
  context: ConversationContext,
  analysis: IntentAnalysisCore,
): AnalyzedUserMessageIntent {
  return {
    ...analysis,
    institutionalIntent: classifyIntent(message, context, analysis),
  };
}

function isThanks(text: string) {
  return /^(gracias|muchas gracias|mil gracias|thank you|thanks|thx)\b/.test(text);
}

function isReportInformationRequest(text: string) {
  return REPORT_INFO_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

function isAmbiguousMunicipalRequest(text: string) {
  if (!text) return true;

  if (/^(?:necesito|quiero|me ayudas|ayuda|ayudame)\b.*\btramite\b/.test(text)) {
    return true;
  }

  if (/^(?:i need|i want|can you help|help me)\b.*\b(?:procedure|paperwork)\b/.test(text)) {
    return true;
  }

  if (
    /^(?:necesito|quiero|me ayudas|ayuda|ayudame)\b.*\b(?:impuestos?|pagos?|rentas)\b/.test(text) &&
    !includesAny(text, ["predial", "industria y comercio", "ica", "comparendo", "valorizacion"])
  ) {
    return true;
  }

  if (
    /^(?:i need|i want|can you help|help me)\b.*\b(?:tax|taxes|payments?)\b/.test(text) &&
    !includesAny(text, ["property tax", "traffic ticket", "municipal taxes"])
  ) {
    return true;
  }

  return wordCount(text) <= 3 && includesAny(text, ["tramite", "tramites", ...AMBIGUOUS_TAX_HINTS]);
}

function hasKnownOfficialReference(text: string) {
  if (
    buildOfficialKnowledgeEntries().some((entry) =>
      includesAny(`${normalizeText(entry.question)} ${normalizeText(entry.answer)}`, [text]),
    )
  ) {
    return true;
  }

  if (
    officialPlaces.some((place) =>
      [place.name, place.category, place.address, place.area ?? "", ...(place.aliases ?? [])]
        .map(normalizeText)
        .some((value) => value && (text.includes(value) || value.includes(text))),
    )
  ) {
    return true;
  }

  return institutionalServices.some((service) =>
    [
      service.titleEs,
      service.titleEn,
      service.descriptionEs,
      service.descriptionEn,
      ...service.aliases,
    ]
      .map(normalizeText)
      .some((value) => value && text.includes(value)),
  );
}

export function analyzeUserMessageIntent(
  message: string,
  context: ConversationContext = {},
): AnalyzedUserMessageIntent {
  const normalized = normalizeText(message);
  const reportInfoRequest = isReportInformationRequest(normalized);
  const reportMessageType =
    context.messageType === "image" && normalized ? "chat" : context.messageType ?? "chat";
  const alertIntent = analyzeCitizenAlertIntent({
    text: message,
    messageType: reportMessageType,
    hasImage: context.hasImage,
    conversationContext: {
      lastIntent: context.lastIntent,
      lastTopic: context.lastTopic,
    },
  });
  const hasMunicipalScope = includesAny(normalized, MUNICIPAL_SCOPE_HINTS);
  const officialDataRequested = includesAny(normalized, OFFICIAL_DATA_HINTS);
  const hasAbsurdHint = includesAny(normalized, ABSURD_OR_OUT_OF_SCOPE_HINTS);
  const hasPaymentHint = includesAny(normalized, PAYMENT_HINTS);
  const hasKnowledgeReference = hasKnownOfficialReference(normalized);

  if (!normalized && context.hasImage) {
    return withInstitutionalIntent(message, context, {
      intent: "AMBIGUOUS",
      confidence: 0.84,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Imagen sin texto suficiente para clasificar.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    });
  }

  if (!normalized) {
    return withInstitutionalIntent(message, context, {
      intent: "AMBIGUOUS",
      confidence: 0.82,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Mensaje vacio o sin contenido util.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    });
  }

  if (isThanks(normalized)) {
    return withInstitutionalIntent(message, context, {
      intent: "THANKS",
      confidence: 0.98,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: "Agradecimiento simple.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    });
  }

  if (isGreeting(normalized) && wordCount(normalized) <= 4) {
    return withInstitutionalIntent(message, context, {
      intent: "GREETING",
      confidence: 0.96,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: "Saludo simple.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    });
  }

  if (hasAbsurdHint) {
    return withInstitutionalIntent(message, context, {
      intent: "ABSURD_OR_UNKNOWN",
      confidence: 0.94,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: true,
      reason: "Pregunta absurda, especulativa o ajena a informacion oficial.",
      officialDataRequested,
      isReportInformationRequest: reportInfoRequest,
    });
  }

  if (alertIntent.shouldCreateAlert && !reportInfoRequest) {
    return withInstitutionalIntent(message, context, {
      intent: alertIntent.intent === "EMERGENCY_ALERT" ? "EMERGENCY_REPORT" : "CITIZEN_REPORT",
      confidence: alertIntent.confidence,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: true,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: `Mensaje describe un hecho ciudadano: ${alertIntent.category ?? "Reporte"}.`,
      officialDataRequested: false,
      isReportInformationRequest: false,
    });
  }

  if (alertIntent.intent === "PRIVATE_SERVICE_QUERY") {
    return withInstitutionalIntent(message, context, {
      intent: "KNOWLEDGE_BASE_QUERY",
      confidence: alertIntent.confidence,
      shouldUseKnowledgeBase: true,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: alertIntent.reason,
      officialDataRequested: true,
      isReportInformationRequest: false,
    });
  }

  if (isAmbiguousMunicipalRequest(normalized)) {
    return withInstitutionalIntent(message, context, {
      intent: "AMBIGUOUS",
      confidence: 0.86,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Consulta municipal incompleta; falta precisar tramite, pago o servicio.",
      officialDataRequested: false,
      isReportInformationRequest: reportInfoRequest,
    });
  }

  if (alertIntent.intent === "INFORMATION_QUERY") {
    return withInstitutionalIntent(message, context, {
      intent: "KNOWLEDGE_BASE_QUERY",
      confidence: alertIntent.confidence,
      shouldUseKnowledgeBase: true,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: alertIntent.reason,
      officialDataRequested: true,
      isReportInformationRequest: false,
    });
  }

  if (alertIntent.intent === "AMBIGUOUS_POSSIBLE_ALERT") {
    return withInstitutionalIntent(message, context, {
      intent: "AMBIGUOUS",
      confidence: alertIntent.confidence,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: alertIntent.reason,
      officialDataRequested: false,
      isReportInformationRequest: false,
    });
  }

  if (reportInfoRequest || alertIntent.intent === "HOW_TO_REPORT") {
    return withInstitutionalIntent(message, context, {
      intent: "AMBIGUOUS",
      confidence: Math.max(0.87, alertIntent.confidence),
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: alertIntent.reason,
      officialDataRequested: false,
      isReportInformationRequest: true,
    });
  }

  if (!hasMunicipalScope && !hasKnowledgeReference) {
    return withInstitutionalIntent(message, context, {
      intent: "OUT_OF_SCOPE",
      confidence: 0.9,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: true,
      reason: "No hay relacion suficiente con Rionegro o servicios municipales.",
      officialDataRequested,
      isReportInformationRequest: reportInfoRequest,
    });
  }

  if (hasPaymentHint) {
    return withInstitutionalIntent(message, context, {
      intent: "PAYMENT_OR_TAX",
      confidence: 0.9,
      shouldUseKnowledgeBase: true,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: "Consulta sobre pagos, impuestos o rentas municipales.",
      officialDataRequested: true,
      isReportInformationRequest: reportInfoRequest,
    });
  }

  if (officialDataRequested || hasKnowledgeReference || reportInfoRequest) {
    return withInstitutionalIntent(message, context, {
      intent: "KNOWLEDGE_BASE_QUERY",
      confidence: 0.88,
      shouldUseKnowledgeBase: true,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: reportInfoRequest
        ? "Pregunta como hacer un reporte; no describe todavia un suceso reportable."
        : "Consulta pide informacion oficial o dato verificable.",
      officialDataRequested: true,
      isReportInformationRequest: reportInfoRequest,
    });
  }

  return withInstitutionalIntent(message, context, {
    intent: "GENERAL_MUNICIPAL_INFO",
    confidence: 0.78,
    shouldUseKnowledgeBase: true,
    shouldCreateCitizenReport: false,
    shouldAskClarifyingQuestion: false,
    shouldRefuseBecauseUnknown: false,
    reason: "Consulta dentro del alcance municipal general.",
    officialDataRequested,
    isReportInformationRequest: reportInfoRequest,
  });
}

export const intentClassifierInternals = {
  normalizeText,
  classifyIntent,
  isReportInformationRequest,
  isAmbiguousMunicipalRequest,
  hasKnownOfficialReference,
};
