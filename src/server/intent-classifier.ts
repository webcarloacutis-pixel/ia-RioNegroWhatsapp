import { buildOfficialKnowledgeEntries, institutionalServices } from "@/lib/rionegro-content";
import { officialPlaces } from "@/lib/rionegro-places";
import { detectCitizenReportIntent } from "@/server/citizen-report-service";

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

export type ConversationContext = {
  lastIntent?: ConversationalIntent | null;
  lastTopic?: string | null;
  messageType?: string;
  hasImage?: boolean;
};

export type AnalyzedUserMessageIntent = {
  intent: ConversationalIntent;
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
];

const AMBIGUOUS_TAX_HINTS = [
  "impuestos",
  "impuesto",
  "pagos",
  "pago",
  "rentas",
];

const ABSURD_OR_OUT_OF_SCOPE_HINTS = [
  "empanada interdimensional",
  "empanadas interdimensionales",
  "interdimensional",
  "extraterrestre",
  "extraterrestres",
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

  if (
    /^(?:necesito|quiero|me ayudas|ayuda|ayudame)\b.*\b(?:impuestos?|pagos?|rentas)\b/.test(text) &&
    !includesAny(text, ["predial", "industria y comercio", "ica", "comparendo", "valorizacion"])
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
  const reportIntent = detectCitizenReportIntent(message, reportMessageType);
  const hasMunicipalScope = includesAny(normalized, MUNICIPAL_SCOPE_HINTS);
  const officialDataRequested = includesAny(normalized, OFFICIAL_DATA_HINTS);
  const hasAbsurdHint = includesAny(normalized, ABSURD_OR_OUT_OF_SCOPE_HINTS);
  const hasPaymentHint = includesAny(normalized, PAYMENT_HINTS);
  const hasKnowledgeReference = hasKnownOfficialReference(normalized);

  if (!normalized && context.hasImage) {
    return {
      intent: "AMBIGUOUS",
      confidence: 0.84,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Imagen sin texto suficiente para clasificar.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    };
  }

  if (!normalized) {
    return {
      intent: "AMBIGUOUS",
      confidence: 0.82,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Mensaje vacio o sin contenido util.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    };
  }

  if (isThanks(normalized)) {
    return {
      intent: "THANKS",
      confidence: 0.98,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: "Agradecimiento simple.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    };
  }

  if (isGreeting(normalized) && wordCount(normalized) <= 4) {
    return {
      intent: "GREETING",
      confidence: 0.96,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: "Saludo simple.",
      officialDataRequested: false,
      isReportInformationRequest: false,
    };
  }

  if (hasAbsurdHint) {
    return {
      intent: "ABSURD_OR_UNKNOWN",
      confidence: 0.94,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: true,
      reason: "Pregunta absurda, especulativa o ajena a informacion oficial.",
      officialDataRequested,
      isReportInformationRequest: reportInfoRequest,
    };
  }

  if (reportIntent.isReport && !reportInfoRequest) {
    return {
      intent: reportIntent.isUrgentSituation ? "EMERGENCY_REPORT" : "CITIZEN_REPORT",
      confidence: reportIntent.isUrgentSituation ? 0.96 : 0.92,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: true,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: `Mensaje describe un hecho ciudadano: ${reportIntent.category}.`,
      officialDataRequested: false,
      isReportInformationRequest: false,
    };
  }

  if (reportInfoRequest) {
    return {
      intent: "AMBIGUOUS",
      confidence: 0.87,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Pregunta como reportar; se pide el hecho y el sector antes de crear caso.",
      officialDataRequested: false,
      isReportInformationRequest: true,
    };
  }

  if (isAmbiguousMunicipalRequest(normalized)) {
    return {
      intent: "AMBIGUOUS",
      confidence: 0.86,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: true,
      shouldRefuseBecauseUnknown: false,
      reason: "Consulta municipal incompleta; falta precisar tramite, pago o servicio.",
      officialDataRequested: false,
      isReportInformationRequest: reportInfoRequest,
    };
  }

  if (!hasMunicipalScope && !hasKnowledgeReference) {
    return {
      intent: "OUT_OF_SCOPE",
      confidence: 0.9,
      shouldUseKnowledgeBase: false,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: true,
      reason: "No hay relacion suficiente con Rionegro o servicios municipales.",
      officialDataRequested,
      isReportInformationRequest: reportInfoRequest,
    };
  }

  if (hasPaymentHint) {
    return {
      intent: "PAYMENT_OR_TAX",
      confidence: 0.9,
      shouldUseKnowledgeBase: true,
      shouldCreateCitizenReport: false,
      shouldAskClarifyingQuestion: false,
      shouldRefuseBecauseUnknown: false,
      reason: "Consulta sobre pagos, impuestos o rentas municipales.",
      officialDataRequested: true,
      isReportInformationRequest: reportInfoRequest,
    };
  }

  if (officialDataRequested || hasKnowledgeReference || reportInfoRequest) {
    return {
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
    };
  }

  return {
    intent: "GENERAL_MUNICIPAL_INFO",
    confidence: 0.78,
    shouldUseKnowledgeBase: true,
    shouldCreateCitizenReport: false,
    shouldAskClarifyingQuestion: false,
    shouldRefuseBecauseUnknown: false,
    reason: "Consulta dentro del alcance municipal general.",
    officialDataRequested,
    isReportInformationRequest: reportInfoRequest,
  };
}

export const intentClassifierInternals = {
  normalizeText,
  isReportInformationRequest,
  isAmbiguousMunicipalRequest,
  hasKnownOfficialReference,
};
