import { addDays } from "date-fns";

import { AppError } from "@/lib/errors";
import { detectUserLanguage, type SupportedLanguage } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import type {
  CitizenReportListResult,
  CitizenReportPriority,
  CitizenReportStatus,
  CitizenReportSummary,
} from "@/lib/types";
import { isPublicHttpUrl } from "@/lib/url-security";
import { getEmergencyContactReference } from "@/server/emergency-contacts";

type CitizenReportImageInput = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
};

type CreateCitizenReportInput = {
  title?: string;
  description: string;
  type?: string;
  category?: string;
  priority?: CitizenReportPriority;
  location?: string;
  address?: string;
  neighborhood?: string;
  source?: "whatsapp" | "web" | "admin";
  reporterPhone?: string;
  reporterName?: string;
  whatsappMessageId?: string;
  whatsappFrom?: string;
  whatsappRawType?: string;
  images?: CitizenReportImageInput[];
};

type ListCitizenReportsFilters = {
  status?: CitizenReportStatus;
  category?: string;
  type?: string;
  priority?: CitizenReportPriority;
  search?: string;
  limit?: number;
};

type UpdateCitizenReportInput = {
  status?: CitizenReportStatus;
  adminNotes?: string | null;
};

export type CitizenReportIntent = {
  isReport: boolean;
  type: string;
  category: string;
  priority: CitizenReportPriority;
  title: string;
  location?: string;
  needsLocation: boolean;
  needsImage: boolean;
  isUrgentSituation: boolean;
  matchedKeywords: string[];
};

export type CitizenAlertIntent =
  | "INFORMATION_QUERY"
  | "PRIVATE_SERVICE_QUERY"
  | "HOW_TO_REPORT"
  | "CITIZEN_ALERT"
  | "EMERGENCY_ALERT"
  | "AMBIGUOUS_POSSIBLE_ALERT"
  | "NOT_ALERT";

export type CitizenAlertIntentAnalysis = {
  intent: CitizenAlertIntent;
  shouldCreateAlert: boolean;
  shouldAskConfirmation: boolean;
  shouldAskForLocation: boolean;
  shouldAskForPhoto: boolean;
  shouldSearchKnowledgeBase: boolean;
  category?: string;
  priority?: CitizenReportPriority;
  location?: string;
  detectedIncident?: string;
  reason: string;
  confidence: number;
};

type CitizenAlertIntentInput = {
  text: string;
  messageType?: string;
  hasImage?: boolean;
  caption?: string | null;
  conversationContext?: {
    state?: string | null;
    lastIntent?: string | null;
    lastTopic?: string | null;
  } | null;
  language?: SupportedLanguage;
};

type HandleCitizenReportInput = {
  text: string;
  messageType: string;
  recipient: string;
  whatsappMessageId?: string;
  whatsappFrom?: string;
  whatsappRawType?: string;
  images?: CitizenReportImageInput[];
  hasImage?: boolean;
  reportIntent?: CitizenReportIntent;
  language?: SupportedLanguage;
};

type HandleCitizenReportResult =
  | {
      handled: true;
      reply: string;
      report?: CitizenReportSummary;
      needsMoreInfo?: boolean;
    }
  | {
      handled: false;
      reply?: never;
      report?: never;
      needsMoreInfo?: never;
    };

type CitizenReportRecord = Omit<CitizenReportSummary, "images"> & {
  images: CitizenReportSummary["images"];
};

const REPORT_STATUSES = new Set<CitizenReportStatus>([
  "pending",
  "reviewing",
  "approved",
  "rejected",
  "converted_to_mass_message",
  "attended",
  "resolved",
]);
const REPORT_PRIORITIES = new Set<CitizenReportPriority>([
  "low",
  "normal",
  "high",
  "urgent",
]);
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const REPORT_KEYWORDS = [
  "denuncia",
  "denunciar",
  "reporte",
  "reporto",
  "alerta",
  "accidente",
  "choque",
  "trancon",
  "trancón",
  "taco",
  "tacos",
  "via cerrada",
  "vía cerrada",
  "cierre vial",
  "cierre de via",
  "cierre de vía",
  "bloqueo",
  "bloqueo vial",
  "carro mal parqueado",
  "moto mal parqueada",
  "moto en el anden",
  "moto en el andén",
  "vehiculo mal parqueado",
  "vehículo mal parqueado",
  "mal parqueado",
  "invadiendo el anden",
  "invadiendo el andén",
  "semaforo",
  "semáforo",
  "hueco",
  "arbol caido",
  "árbol caído",
  "inundacion",
  "inundación",
  "poste caido",
  "poste caído",
  "poste en riesgo",
  "cable caido",
  "cable caído",
  "alcantarilla destapada",
  "basura",
  "ruido",
  "emergencia",
  "incendio",
  "explosion",
  "explosión",
  "atentado",
  "ataque",
  "ataque terrorista",
  "posible atentado",
  "balacera",
  "disparos",
  "derrumbe",
  "deslizamiento",
  "manifestacion",
  "manifestación",
  "disturbios",
  "riña",
  "pelea",
  "persona herida",
  "heridos",
  "ambulancia",
  "fuga de gas",
  "animal en la via",
  "animal en la vía",
  "aceite en la via",
  "aceite en la vía",
  "peligro en la via",
  "peligro en la vía",
  "anden",
  "andén",
  "report",
  "reporting",
  "incident",
  "accident",
  "crash",
  "collision",
  "traffic jam",
  "road closed",
  "blocked road",
  "badly parked",
  "pothole",
  "fallen tree",
  "tree fell",
  "flood",
  "flooding",
  "fire",
  "explosion",
  "gunshots",
  "shots",
  "landslide",
  "gas leak",
  "animal on the road",
  "dog was hit",
  "dangerous pothole",
];

const REPORT_NATURAL_PATTERNS = [
  /\bhay\s+(?:un|una)\s+accidente\b/,
  /\bse\s+cayo\s+(?:un\s+)?arbol\b/,
  /\bse\s+cayo\s+(?:un\s+)?poste\b/,
  /\bhay\s+(?:un|una)\s+(?:carro|moto|vehiculo).*(?:bloqueando|mal\s+parquead|anden)\b/,
  /\bla\s+via\s+esta\s+cerrada\b/,
  /\bel\s+semaforo\s+(?:no\s+sirve|esta\s+danado|danado)\b/,
  /\bhay\s+(?:un\s+)?hueco\b/,
  /\buna\s+moto\s+esta\s+en\s+el\s+anden\b/,
  /\bhay\s+(?:un\s+)?taco\b/,
  /\bhay\s+(?:una\s+)?explosion\b/,
  /\bhay\s+(?:un\s+)?incendio\b/,
  /\bescuche\s+disparos\b/,
  /\bhay\s+(?:una\s+)?inundacion\b/,
  /\bhay\s+(?:un\s+)?cierre\s+vial\b/,
  /\bhay\s+(?:un\s+)?bloqueo\b/,
  /\bhay\s+(?:una\s+)?persona\s+herida\b/,
  /\bthere\s+is\s+(?:an?\s+)?accident\b/,
  /\bthere\s+is\s+(?:a\s+)?fire\b/,
  /\bi\s+heard\s+gunshots\b/,
  /\bthere\s+is\s+(?:a\s+)?dangerous\s+pothole\b/,
  /\b(?:a\s+)?tree\s+fell\b/,
  /\bfallen\s+tree\b/,
  /\bthere\s+is\s+flooding\b/,
  /\b(?:a\s+)?dog\s+was\s+hit\b/,
];

const URGENT_SITUATION_PATTERN =
  /(atentado|ataque terrorista|posible atentado|explosion|balacera|disparos|incendio|fuga de gas|herido|heridos|ambulancia|derrumbe|deslizamiento|attack|explosion|gunshots|shots|fire|gas leak|injured|ambulance|landslide)/;

const REPORT_INFORMATION_REQUEST_PATTERNS = [
  /^(?:como|donde|que|cual|puedo|debo|necesito saber|quiero saber|me puedes decir)\b.*\b(?:denuncia|denunciar|reporte|reportar|reporto)\b/,
  /^(?:como|que)\s+hago\b.*\b(?:denuncia|denunciar|reporte|reportar|hueco|accidente|choque)\b/,
  /^(?:donde|como)\b.*\b(?:transito|movilidad|inspeccion|policia|fiscalia)\b/,
  /^(?:how|where|what|can|could|should|i need to know|please tell me)\b.*\b(?:complaint|report|reporting|incident|pothole|accident|crash)\b/,
  /^how\s+(?:can|do)\s+i\s+report\b/,
];

export const CLASSIFICATION_RULES: Array<{
  pattern: RegExp;
  category: string;
  priority: CitizenReportPriority;
  type: string;
}> = [
  {
    pattern: /(atentado|ataque(?: terrorista)?|posible atentado|balacera|disparos|gunshots|shots|armed attack)/,
    category: "Seguridad",
    priority: "urgent",
    type: "seguridad",
  },
  {
    pattern: /(incendio|fire|flames)/,
    category: "Incendio",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(explosion|blast)/,
    category: "Explosión",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(fuga de gas|gas leak)/,
    category: "Emergencia",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(accidente|choque|herido|heridos|ambulancia|accident|crash|collision|injured|ambulance)/,
    category: "Accidente",
    priority: "urgent",
    type: "transito",
  },
  {
    pattern: /(derrumbe|deslizamiento|landslide)/,
    category: "Riesgo",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(inundacion|flood|flooding)/,
    category: "Inundación",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(manifestacion|disturbios|bloqueo(?:\s+vial)?)/,
    category: "Orden público",
    priority: "high",
    type: "seguridad",
  },
  {
    pattern: /(trancon|tacos?|via cerrada|cierre vial|cierre de via|bloqueando la via|animal en la via|traffic jam|road closed|blocked road|animal on the road)/,
    category: "Tránsito",
    priority: "high",
    type: "transito",
  },
  {
    pattern: /(aceite en la via|peligro en la via)/,
    category: "Riesgo vial",
    priority: "high",
    type: "transito",
  },
  {
    pattern: /(carro|moto|vehiculo).*(mal parquead|bloqueando|obstruyendo)|mal parquead|anden|invadiendo/,
    category: "Vehículo mal parqueado",
    priority: "normal",
    type: "transito",
  },
  {
    pattern: /(semaforo)/,
    category: "Semáforo dañado",
    priority: "high",
    type: "transito",
  },
  {
    pattern: /(hueco|pothole)/,
    category: "Hueco en vía",
    priority: "normal",
    type: "infraestructura",
  },
  {
    pattern: /(arbol caido|se cayo.*arbol|fallen tree|tree fell|tree on the road)/,
    category: "Árbol caído",
    priority: "high",
    type: "emergencia",
  },
  {
    pattern: /(poste caido|se cayo.*poste|poste en riesgo|cable caido|alcantarilla destapada)/,
    category: "Servicios públicos",
    priority: "high",
    type: "infraestructura",
  },
  {
    pattern: /(basura)/,
    category: "Basuras",
    priority: "normal",
    type: "convivencia",
  },
  {
    pattern: /(ruido|rina|pelea)/,
    category: "Ruido",
    priority: "normal",
    type: "convivencia",
  },
  {
    pattern: /(emergencia)/,
    category: "Emergencia",
    priority: "urgent",
    type: "emergencia",
  },
];

const globalForCitizenReports = globalThis as unknown as {
  __rionegroCitizenReports?: CitizenReportRecord[];
};

function getMockReports() {
  if (!globalForCitizenReports.__rionegroCitizenReports) {
    globalForCitizenReports.__rionegroCitizenReports = [];
  }

  return globalForCitizenReports.__rionegroCitizenReports;
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Â¿?Â¡!.,;:()[\]{}"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeText(value: string, maxLength = MAX_DESCRIPTION_LENGTH) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeOptionalText(value?: string | null, maxLength = 160) {
  const sanitized = sanitizeText(value ?? "", maxLength);
  return sanitized || null;
}

function isDatabaseUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false;

  const errorWithCode = error as Error & { code?: string };
  const recoverableCodes = new Set([
    "P1000",
    "P1001",
    "P1002",
    "P1008",
    "P1010",
    "P1011",
    "P1012",
    "P1017",
    "P2021",
    "P2022",
    "P2024",
  ]);
  const message = error.message;

  return (
    Boolean(errorWithCode.code && recoverableCodes.has(errorWithCode.code)) ||
    message.includes("Authentication failed against database server") ||
    message.includes("Can't reach database server") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("does not exist") ||
    message.includes("The table") ||
    message.includes("relation") ||
    message.includes("Environment variable not found") ||
    message.includes("Invalid `prisma.")
  );
}

async function withMockFallback<T>(
  runWithDatabase: () => Promise<T>,
  runWithMock: () => Promise<T>,
) {
  try {
    return await runWithDatabase();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    console.warn("[citizen-reports] using memory fallback", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return runWithMock();
  }
}

function assertValidStatus(status: CitizenReportStatus) {
  if (!REPORT_STATUSES.has(status)) {
    throw new AppError("Estado de reporte no permitido.", 400);
  }
}

function assertValidPriority(priority: CitizenReportPriority) {
  if (!REPORT_PRIORITIES.has(priority)) {
    throw new AppError("Prioridad de reporte no permitida.", 400);
  }
}

function isImageUrlAllowed(url: string) {
  return isPublicHttpUrl(url);
}

function isAllowedImage(input: CitizenReportImageInput) {
  if (!isImageUrlAllowed(input.url)) return false;
  if (input.size && input.size > MAX_IMAGE_SIZE_BYTES) return false;

  const mimeType = input.mimeType?.toLowerCase();

  if (mimeType) {
    return ALLOWED_IMAGE_MIME_TYPES.has(mimeType);
  }

  return /\.(jpe?g|png|webp)(?:\?|$)/i.test(input.url);
}

function sanitizeImages(images: CitizenReportImageInput[] = []) {
  return images
    .filter(isAllowedImage)
    .slice(0, 4)
    .map((image) => ({
      url: image.url,
      filename: sanitizeOptionalText(image.filename, 120),
      mimeType: sanitizeOptionalText(image.mimeType, 80),
      size: image.size && image.size > 0 ? Math.min(image.size, MAX_IMAGE_SIZE_BYTES) : null,
    }));
}

function maskPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `****${digits.slice(-4)}`;
}

const KNOWN_REPORT_LOCATIONS = [
  { key: "llanogrande", label: "Llanogrande" },
  { key: "san antonio", label: "San Antonio" },
  { key: "ojos de agua", label: "Ojos de Agua" },
  { key: "centro", label: "Centro" },
  { key: "el porvenir", label: "El Porvenir" },
  { key: "autopista", label: "Autopista" },
  { key: "aeropuerto", label: "Aeropuerto" },
  { key: "parque", label: "parque" },
  { key: "hospital", label: "hospital" },
  { key: "colegio", label: "colegio" },
  { key: "downtown", label: "Centro" },
  { key: "airport", label: "Aeropuerto" },
  { key: "park", label: "parque" },
];

function findKnownReportLocation(text: string) {
  const normalized = normalizeText(text);
  const viaMatch = normalized.match(
    /\b(?:en\s+|por\s+|on\s+)?(?:la\s+)?(?:via|road)\s+(san antonio|llanogrande|ojos de agua|el porvenir|centro|autopista|aeropuerto|parque|hospital|colegio|downtown|airport|park)\b/,
  );

  if (viaMatch?.[1]) {
    const matched = KNOWN_REPORT_LOCATIONS.find((item) => item.key === viaMatch[1]);
    return `via ${matched?.label ?? viaMatch[1]}`;
  }

  const directMatch = KNOWN_REPORT_LOCATIONS.find((item) =>
    new RegExp(`\\b${item.key.replace(/\s+/g, "\\s+")}\\b`).test(normalized),
  );

  return directMatch?.label;
}

function normalizeReportLocation(value: string) {
  return sanitizeText(value, 120)
    .replace(/^\s*la\s+via\b/i, "via")
    .replace(/\s+/g, " ")
    .trim();
}

function inferLocation(text: string) {
  const knownLocation = findKnownReportLocation(text);

  if (knownLocation) {
    return normalizeReportLocation(knownLocation);
  }

  const patterns = [
    /\b(?:en|por)\s+(San Antonio|Ojos de Agua|el centro|la autopista|el aeropuerto|la glorieta|Llanogrande)\b/i,
    /\b(?:in|at|near)\s+(San Antonio|Ojos de Agua|downtown|the airport|the park|Llanogrande)\b/i,
    /\b(?:en|por)\s+((?:la\s+)?v[ií]a\s+[^.,;\n]+)/i,
    /\b(?:on|near)\s+((?:the\s+)?(?:road|street)\s+[^.,;\n]+)/i,
    /\bv[ií]a\s+(?!esta\b|cerrada\b|bloqueada\b)([^.,;\n]+)/i,
    /\broad\s+(?!is\b|closed\b|blocked\b)([^.,;\n]+)/i,
    /\bcerca\s+(?:al|del|de)\s+([^.,;\n]+)/i,
    /\bnear\s+(?:the\s+)?([^.,;\n]+)/i,
    /\bfrente\s+(?:al|a la|a)\s+([^.,;\n]+)/i,
    /\ben\s+la\s+entrada\s+(?:del|de la)\s+([^.,;\n]+)/i,
    /\b(?:en|por)\s+((?:el\s+)?barrio\s+[^.,;\n]+)/i,
    /\b(?:en|por)\s+((?:la\s+)?vereda\s+[^.,;\n]+)/i,
    /\b(?:sector|zona)\s+([^.,;\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();

    if (value && value.length >= 3) {
      const sanitized = sanitizeText(value, 120);
      const normalized = normalizeText(sanitized);

      if (
        ![
          "el anden",
          "anden",
          "la via",
          "via",
          "la calle",
          "calle",
          "el lugar",
          "lugar",
        ].includes(normalized)
      ) {
        return normalizeReportLocation(sanitized);
      }
    }
  }

  return undefined;
}

export function extractLocationFromReportText(text: string) {
  return inferLocation(text);
}

function getMatchedReportKeywords(normalizedText: string) {
  const keywordMatches = REPORT_KEYWORDS.filter((keyword) =>
    normalizedText.includes(normalizeText(keyword)),
  ).map(normalizeText);
  const naturalMatches = REPORT_NATURAL_PATTERNS.filter((pattern) =>
    pattern.test(normalizedText),
  ).map((pattern) => pattern.source);

  return [...new Set([...keywordMatches, ...naturalMatches])];
}

function isReportInformationRequest(normalizedText: string) {
  return REPORT_INFORMATION_REQUEST_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

const PRIVATE_SERVICE_PATTERN =
  /\b(?:veterinari[ao]s?|farmacias?|taxi|taxis|gruas?|clinicas?|hospital(?:es)?|hoteles?|restaurantes?|droguerias?|comercio|negocio|taller(?:es)?|vet|vets|veterinary|pharmacy|pharmacies|tow\s*truck|clinic|clinics|hotels?|restaurants?|workshops?)\b/;

const PRIVATE_HELP_PATTERN =
  /\b(?:(?:mi|mis)\s+(?:gato|gata|perro|perra|mascota|mama|madre|papa|padre|hijo|hija|familiar)|my\s+(?:cat|dog|pet|mother|mom|father|dad|child|relative))\b.*\b(?:enferm|urgencia|ayuda|atencion|hospital|clinica|veterinari|medico|sick|emergency|help|care|clinic|veterinary|vet|medical)\b/;

const SERVICE_QUERY_PATTERN =
  /\b(?:donde|necesito|busco|buscar|hay|queda|abiert[ao]s?|24\s*horas|urgencias?|llevarlo|llevarla|where|need|looking|search|open|24\s*hours|emergency|take\s+him|take\s+her)\b/;

const HOW_TO_REPORT_PATTERN =
  /^(?:como|que hago|donde|cual|puedo|debo|necesito saber|quiero saber|me puedes decir|how|where|what|can|could|should|i need to know|please tell me)\b.*\b(?:denuncia|denunciar|reporte|reportar|reporto|hueco|accidente|choque|arbol caido|incendio|complaint|report|reporting|incident|pothole|accident|crash|fallen tree|fire)\b/;

const AMBIGUOUS_ALERT_PATTERNS = [
  /\bnecesito\s+ayuda(?:\s+urgente)?\b/,
  /\bayuda\s+urgente\b/,
  /\bhay\s+(?:un\s+)?problema\b/,
  /\balgo\s+paso\b/,
  /\bpaso\s+algo\b/,
  /\bhay\s+un\s+olor\s+raro\b/,
  /\bvi\s+algo\s+peligroso\b/,
  /\bhay\s+(?:un\s+)?perro\s+herido\b/,
  /\bhay\s+(?:un\s+)?animal\s+herido\b/,
  /\bi\s+need\s+(?:urgent\s+)?help\b/,
  /\bthere\s+is\s+(?:a\s+)?problem\b/,
  /\bsomething\s+happened\b/,
  /\bi\s+saw\s+something\s+dangerous\b/,
];

const PUBLIC_CONTEXT_PATTERN =
  /\b(?:via|vial|carretera|autopista|calle|anden|parque|barrio|sector|vereda|glorieta|entrada|puente|colegio|hospital|aeropuerto|centro|llanogrande|san antonio|ojos de agua|road|street|sidewalk|park|neighborhood|area|bridge|school|airport|downtown)\b/;

const PERSONAL_PET_PATTERN =
  /\b(?:(?:mi|mis)\s+(?:gato|gata|perro|perra|mascota)|my\s+(?:cat|dog|pet))\b/;

const ALERT_RULES: Array<{
  pattern: RegExp;
  category: string;
  priority: CitizenReportPriority;
  type: string;
  incident: string;
  requiresPublicContext?: boolean;
}> = [
  {
    pattern: /\b(?:disparos|tiros|balacera|pelea con armas|amenaza armada|gunshots|shots|armed threat)\b/,
    category: "Seguridad",
    priority: "urgent",
    type: "seguridad",
    incident: "seguridad",
  },
  {
    pattern: /\b(?:incendio|llamas|se esta quemando|humo de una vivienda|humo de una casa|fire|flames|smoke from a house)\b/,
    category: "Incendio",
    priority: "urgent",
    type: "emergencia",
    incident: "incendio",
  },
  {
    pattern: /\b(?:explosion|estallido|bomba|atentado|blast|bomb)\b/,
    category: "Explosion",
    priority: "urgent",
    type: "emergencia",
    incident: "explosion",
  },
  {
    pattern: /\b(?:fuga de gas|olor a gas|huele mucho a gas|cilindro danado|gas leak|smell of gas)\b/,
    category: "Fuga de gas",
    priority: "urgent",
    type: "emergencia",
    incident: "fuga de gas",
  },
  {
    pattern: /\b(?:inundacion|agua entrando|creciente|quebrada desbordada|agua por todas partes|flood|flooding|water entering)\b/,
    category: "Inundacion",
    priority: "urgent",
    type: "emergencia",
    incident: "inundacion",
  },
  {
    pattern: /\b(?:derrumbe|deslizamiento|tierra en la via|caida de banca|landslide|mudslide)\b/,
    category: "Derrumbe",
    priority: "urgent",
    type: "emergencia",
    incident: "derrumbe",
  },
  {
    pattern:
      /\b(?:(?:atropellaron|atropellad[oa])\s+(?:un\s+|una\s+)?(?:perro|gato|animal)|(?:perro|gato|animal|caballo|ganado|vaca|reses|dog|cat|animal|horse|cattle).*(?:atropellad[oa]?|herid[oa]?|muert[oa]?|suelto|bloqueando|agresiv|atacando|hit|injured|dead|loose|blocking|aggressive|attacking)|(?:dog|cat|animal)\s+was\s+hit)\b/,
    category: "Animal en via",
    priority: "high",
    type: "transito",
    incident: "animal en via",
  },
  {
    pattern:
      /\b(?:accidente|choque|se chocaron|moto se cayo|moto caida|carro volcado|volcado|persona herida|personas heridas|heridos?|accident|crash|collision|car overturned|injured person|injured people)\b/,
    category: "Accidente",
    priority: "urgent",
    type: "transito",
    incident: "accidente",
  },
  {
    pattern:
      /\b(?:(?:se\s+)?cayo\s+(?:un\s+)?(?:arbol|palo|rama)|(?:arbol|palo|rama|tree|branch).*(?:caido|bloqueando|fell|fallen|blocking)|(?:a\s+)?tree\s+fell|fallen\s+tree)\b/,
    category: "Arbol caido",
    priority: "high",
    type: "emergencia",
    incident: "arbol caido",
  },
  {
    pattern: /\b(?:poste caido|se cayo.*poste|cable(?:s)? en el suelo|cable(?:s)? caido|cable(?:s)? colgando)\b/,
    category: "Poste o cable caido",
    priority: "high",
    type: "infraestructura",
    incident: "poste o cable caido",
  },
  {
    pattern: /\b(?:semaforo(?:s)? (?:no sirve|apagado|danado)|semaforo danado)\b/,
    category: "Semaforo danado",
    priority: "high",
    type: "transito",
    incident: "semaforo danado",
  },
  {
    pattern: /\b(?:hueco|crater|via danada|calle rota|calle vuelta nada|pothole|road damage|damaged road)\b/,
    category: "Hueco en via",
    priority: "normal",
    type: "infraestructura",
    incident: "hueco en via",
  },
  {
    pattern:
      /\b(?:(?:carro|moto|vehiculo).*(?:bloqueando|atravesado|mal parquead|obstruyendo)|moto en el anden|carro bloqueando|vehiculo bloqueando)\b/,
    category: "Vehiculo bloqueando",
    priority: "normal",
    type: "transito",
    incident: "vehiculo bloqueando",
  },
  {
    pattern: /\b(?:basura|escombros|residuos)\b.*\b(?:via|calle|anden|parque|tirad[ao]s?)\b/,
    category: "Basuras",
    priority: "normal",
    type: "convivencia",
    incident: "basuras",
  },
  {
    pattern: /\b(?:ruido|bulla|musica muy alta)\b/,
    category: "Ruido",
    priority: "low",
    type: "convivencia",
    incident: "ruido",
    requiresPublicContext: true,
  },
];

function isPrivateServiceQuery(normalizedText: string) {
  if (!normalizedText) return false;
  if (PRIVATE_HELP_PATTERN.test(normalizedText)) return true;
  return PRIVATE_SERVICE_PATTERN.test(normalizedText) && SERVICE_QUERY_PATTERN.test(normalizedText);
}

function isHowToReportQuery(normalizedText: string) {
  return HOW_TO_REPORT_PATTERN.test(normalizedText) || isReportInformationRequest(normalizedText);
}

function extractIncidentType(normalizedText: string) {
  for (const rule of ALERT_RULES) {
    if (!rule.pattern.test(normalizedText)) {
      continue;
    }

    if (rule.requiresPublicContext && !PUBLIC_CONTEXT_PATTERN.test(normalizedText)) {
      continue;
    }

    if (rule.incident === "animal en via" && PERSONAL_PET_PATTERN.test(normalizedText)) {
      continue;
    }

    if (
      rule.incident === "animal en via" &&
      !PUBLIC_CONTEXT_PATTERN.test(normalizedText) &&
      !/\b(?:atropellaron|atropellad[oa])\b/.test(normalizedText)
    ) {
      continue;
    }

    return rule;
  }

  return null;
}

function isActualIncidentReport(normalizedText: string) {
  return Boolean(extractIncidentType(normalizedText));
}

function isAmbiguousPossibleAlert(normalizedText: string) {
  if (!normalizedText) return false;
  if (AMIGUOUS_CONFIRMATION_PATTERN.test(normalizedText)) return true;
  return AMBIGUOUS_ALERT_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

const AMIGUOUS_CONFIRMATION_PATTERN =
  /\b(?:quiero|necesito)\s+(?:poner|crear|hacer|registrar)?\s*(?:una\s+)?(?:alerta|reporte|denuncia)\b(?!.*\b(?:en|por|via|calle|sector|barrio)\b)/;

export function analyzeCitizenAlertIntent(
  input: CitizenAlertIntentInput,
): CitizenAlertIntentAnalysis {
  const combinedText = [input.text, input.caption].filter(Boolean).join(" ");
  const normalized = normalizeText(combinedText);
  const messageType = input.messageType?.toLowerCase() ?? "chat";
  const hasImage = Boolean(input.hasImage || messageType === "image");
  const location = inferLocation(combinedText);

  if (!normalized && hasImage) {
    return {
      intent: "AMBIGUOUS_POSSIBLE_ALERT",
      shouldCreateAlert: false,
      shouldAskConfirmation: true,
      shouldAskForLocation: true,
      shouldAskForPhoto: false,
      shouldSearchKnowledgeBase: false,
      reason: "Imagen sin descripcion suficiente; se piden datos antes de crear alerta.",
      confidence: 0.82,
    };
  }

  if (!normalized) {
    return {
      intent: "NOT_ALERT",
      shouldCreateAlert: false,
      shouldAskConfirmation: false,
      shouldAskForLocation: false,
      shouldAskForPhoto: false,
      shouldSearchKnowledgeBase: false,
      reason: "Mensaje sin texto util.",
      confidence: 0.78,
    };
  }

  if (isHowToReportQuery(normalized)) {
    return {
      intent: "HOW_TO_REPORT",
      shouldCreateAlert: false,
      shouldAskConfirmation: false,
      shouldAskForLocation: false,
      shouldAskForPhoto: false,
      shouldSearchKnowledgeBase: false,
      reason: "El usuario pregunta como reportar; todavia no describe un hecho a registrar.",
      confidence: 0.9,
    };
  }

  const incident = extractIncidentType(normalized);

  if (incident) {
    const shouldAskForLocation = !location;
    return {
      intent: incident.priority === "urgent" ? "EMERGENCY_ALERT" : "CITIZEN_ALERT",
      shouldCreateAlert: true,
      shouldAskConfirmation: false,
      shouldAskForLocation,
      shouldAskForPhoto: true,
      shouldSearchKnowledgeBase: false,
      category: incident.category,
      priority: incident.priority,
      location,
      detectedIncident: incident.incident,
      reason: `Describe un incidente publico observable: ${incident.incident}.`,
      confidence: incident.priority === "urgent" ? 0.95 : 0.91,
    };
  }

  if (isPrivateServiceQuery(normalized)) {
    return {
      intent: "PRIVATE_SERVICE_QUERY",
      shouldCreateAlert: false,
      shouldAskConfirmation: false,
      shouldAskForLocation: false,
      shouldAskForPhoto: false,
      shouldSearchKnowledgeBase: true,
      reason: "Consulta sobre servicio privado o ayuda personal; no es alerta ciudadana.",
      confidence: 0.93,
    };
  }

  if (isAmbiguousPossibleAlert(normalized)) {
    return {
      intent: "AMBIGUOUS_POSSIBLE_ALERT",
      shouldCreateAlert: false,
      shouldAskConfirmation: true,
      shouldAskForLocation: !location,
      shouldAskForPhoto: false,
      shouldSearchKnowledgeBase: false,
      location,
      reason: "Puede ser una alerta, pero faltan hecho observable y confirmacion.",
      confidence: 0.84,
    };
  }

  if (
    /\b(?:donde|como|cual|horario|queda|pagar|pago|tramite|predial|alcaldia|transito|atencion|telefono|direccion|where|how|what|hours|schedule|pay|payment|procedure|property tax|city hall|traffic|phone|address|weather|raining)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "INFORMATION_QUERY",
      shouldCreateAlert: false,
      shouldAskConfirmation: false,
      shouldAskForLocation: false,
      shouldAskForPhoto: false,
      shouldSearchKnowledgeBase: true,
      reason: "Consulta informativa; se debe responder con base oficial si existe.",
      confidence: 0.88,
    };
  }

  return {
    intent: "NOT_ALERT",
    shouldCreateAlert: false,
    shouldAskConfirmation: false,
    shouldAskForLocation: false,
    shouldAskForPhoto: false,
    shouldSearchKnowledgeBase: false,
    reason: "No describe una alerta ciudadana.",
    confidence: 0.8,
  };
}

function buildReportTitle(category: string, text: string) {
  const cleaned = sanitizeText(text.replace(/^(denuncia|reporte|alerta)\s*:\s*/i, ""), 70);
  return `${category}: ${cleaned || "Reporte ciudadano"}`;
}

export function isCitizenReportMessage(text: string) {
  return detectCitizenReportIntent(text).isReport;
}

export function detectCitizenReportIntent(
  text: string,
  messageType = "chat",
): CitizenReportIntent {
  const normalized = normalizeText(text);
  const alertIntent = analyzeCitizenAlertIntent({ text, messageType });
  const matchedKeywords = getMatchedReportKeywords(normalized);
  const category = alertIntent.category ?? "Otro";
  const priority = alertIntent.priority ?? "normal";
  const type =
    ALERT_RULES.find((rule) => rule.category === category && rule.priority === priority)?.type ??
    "general";
  const isReport = alertIntent.shouldCreateAlert;
  const location = inferLocation(text);

  return {
    isReport,
    type,
    category,
    priority,
    title: buildReportTitle(category, text),
    location,
    needsLocation: alertIntent.shouldAskForLocation,
    needsImage: alertIntent.shouldAskForPhoto,
    isUrgentSituation: alertIntent.priority === "urgent" || URGENT_SITUATION_PATTERN.test(normalized),
    matchedKeywords,
  };
}

export function classifyCitizenReport(text: string) {
  return detectCitizenReportIntent(text);
}

function buildLocationPhrase(location?: string | null) {
  if (!location) return "";

  const normalized = normalizeText(location);

  if (normalized.startsWith("via ")) {
    return `en la ${location}`;
  }

  if (/^(autopista|parque|hospital|colegio|aeropuerto)\b/.test(normalized)) {
    return `en ${location}`;
  }

  return `en el sector de ${location}`;
}

function buildEnglishLocationPhrase(location?: string | null) {
  if (!location) return "";

  const normalized = normalizeText(location);

  if (normalized.startsWith("via ") || normalized.startsWith("road ")) {
    return `on ${location}`;
  }

  if (/^(autopista|parque|hospital|colegio|aeropuerto|airport|park|downtown|centro)\b/.test(normalized)) {
    return `at ${location}`;
  }

  return `in ${location}`;
}

function buildKnownLocationReportReply(intent: CitizenReportIntent, language: SupportedLanguage) {
  const locationPhrase =
    language === "en"
      ? buildEnglishLocationPhrase(intent.location)
      : buildLocationPhrase(intent.location);
  const category = normalizeText(intent.category);

  if (language === "en") {
    if (category.includes("accidente")) {
      return [
        `Thank you for reporting it. We have registered the accident ${locationPhrase} for review.`,
        "",
        "If you can, please send a photo of the place or a more exact reference point.",
      ].join("\n");
    }

    if (category.includes("arbol")) {
      return [
        `Thank you for reporting it. We have registered the fallen tree case ${locationPhrase} for review.`,
        "",
        "If you can, please send a photo of the place or a more exact reference point.",
      ].join("\n");
    }

    if (category.includes("animal")) {
      return [
        `Thank you for reporting it. We have registered the animal-on-road case ${locationPhrase} for review.`,
        "",
        "If you can, please send a photo of the place or a more exact reference point.",
      ].join("\n");
    }

    return [
      `Thank you for reporting it. We have registered the incident ${locationPhrase} for review.`,
      "",
      "If you can, please send a photo of the place or a more exact reference point.",
    ].join("\n");
  }

  if (category.includes("accidente")) {
    return [
      `Gracias por reportarlo. Ya registramos el accidente ${locationPhrase} para revision.`,
      "",
      "Si puedes, envianos una foto del lugar o un punto de referencia mas exacto.",
    ].join("\n");
  }

  if (category.includes("arbol")) {
    return [
      `Gracias por reportarlo. Ya registramos el caso de arbol caido ${locationPhrase} para revision.`,
      "",
      "Si puedes, envianos una foto del lugar o un punto de referencia mas exacto.",
    ].join("\n");
  }

  if (category.includes("animal")) {
    return [
      `Gracias por avisar. Ya registramos el reporte de animal herido ${locationPhrase} para revision.`,
      "",
      "Si puedes, envianos una foto del lugar o un punto de referencia mas exacto.",
    ].join("\n");
  }

  return [
    `Gracias por reportarlo. Ya registramos el caso ${locationPhrase} para revision.`,
    "",
    "Si puedes, envianos una foto del lugar o un punto de referencia mas exacto.",
  ].join("\n");
}

function buildCitizenReportReply(
  intent: CitizenReportIntent,
  hasImage: boolean,
  language: SupportedLanguage,
) {
  if (intent.isUrgentSituation) {
    const emergencyLine = getEmergencyContactReference();

    if (language === "en") {
      if (intent.needsLocation) {
        return [
          "Thank you for reporting it. We have registered the incident as a possible urgent situation for review.",
          "",
          `Please tell me the exact location or area where it is happening. If you can, also send a photo of the place. If there are injured people or immediate risk, please also contact ${emergencyLine}.`,
        ].join("\n");
      }

      if (intent.category === "Accidente" && intent.location) {
        return [
          `Thank you for reporting it. We have registered the accident ${buildEnglishLocationPhrase(intent.location)} for review.`,
          "",
          `If you can, please send a photo of the place or a more exact reference point. If there are injured people or immediate risk, please also contact ${emergencyLine}.`,
        ].join("\n");
      }

      return [
        "Thank you for reporting it. We have registered the incident as a possible urgent situation for review.",
        "",
        `If you can, please send a photo of the place or a more exact reference point. If there are injured people or immediate risk, please also contact ${emergencyLine}.`,
      ].join("\n");
    }

    if (intent.needsLocation) {
      return [
        "Gracias por avisar. Registramos el reporte como posible situación urgente para revisión.",
        "",
        `Dime por favor la ubicación exacta o el sector donde ocurre. Si puedes, envía tambien una foto del lugar. Si hay personas heridas o riesgo inmediato, comunícate también con ${emergencyLine}.`,
      ].join("\n");
    }

    if (intent.category === "Accidente" && intent.location) {
      return [
        `Gracias por reportarlo. Ya registramos el accidente ${buildLocationPhrase(intent.location)} para revision.`,
        "",
        `Si puedes, envíanos una foto del lugar o un punto de referencia más exacto. Si hay personas heridas o riesgo inmediato, comunícate también con ${emergencyLine}.`,
      ].join("\n");
    }

    return [
      "Gracias por avisar. Registramos el reporte como posible situación urgente para revisión.",
      "",
      `Si puedes, envíanos una foto del lugar o un punto de referencia más exacto. Si hay personas heridas o riesgo inmediato, por favor comunícate también con ${emergencyLine}.`,
    ].join("\n");
  }

  if (intent.needsLocation) {
    if (language === "en") {
      return "Thank you for reporting it. To register it properly, please tell me the exact location or area where it happened. If you can, also send a photo of the place.";
    }

    if (intent.category === "Accidente") {
      return "Gracias por reportarlo. Para registrarlo bien, dime por favor la ubicación exacta o el sector donde ocurrió el accidente. Si puedes, envía también una foto del lugar.";
    }

    return "Gracias por reportarlo. Para registrarlo correctamente, dime por favor en qué sector o dirección ocurrió. Si puedes, envía también una foto del lugar.";
  }

  if (hasImage) {
    if (language === "en") {
      return [
        "Thank you for reporting it. We received the information and the image. The case is registered for review by the administrative team.",
        "",
        "If you have another detail, such as a more exact reference point, you can send it here.",
      ].join("\n");
    }

    return [
      "Gracias por reportarlo. Ya recibimos la información y la imagen del suceso. El caso queda registrado para revisión del equipo administrativo.",
      "",
      "Si tienes otro dato, como un punto de referencia más exacto, puedes enviarlo por aquí.",
    ].join("\n");
  }

  if (intent.location) {
    return buildKnownLocationReportReply(intent, language);
  }

  if (language === "en") {
    return [
      "Thank you for reporting it. We have registered the information for review.",
      "",
      "If you can, please send a photo of the place and a more exact location to help identify the case better.",
    ].join("\n");
  }

  return [
    "Gracias por reportarlo. Ya registramos la información para revisión.",
    "",
    "Si puedes, envíanos una foto del lugar y una ubicación más exacta para ayudar a identificar mejor el caso.",
  ].join("\n");
}

export async function handleCitizenReport(
  input: HandleCitizenReportInput,
): Promise<HandleCitizenReportResult> {
  const messageType = input.messageType.toLowerCase();
  const hasImage = Boolean(input.hasImage || input.images?.length);
  const description = sanitizeText(input.text);
  const language = input.language ?? detectUserLanguage({ text: description }).language;
  const intent =
    input.reportIntent ?? detectCitizenReportIntent(description, messageType);

  if (hasImage) {
    console.log("[citizen-reports] image received", {
      storedImages: input.images?.length ?? 0,
    });
  }

  if (!description) {
    return {
      handled: true,
      reply:
        language === "en"
          ? "We received the image. Please tell us what happened and where, so we can register the report properly."
          : "Recibimos la imagen. Cuentanos por favor que ocurrio y en que lugar para poder registrar el reporte correctamente.",
      needsMoreInfo: true,
    };
  }

  if (!intent.isReport && messageType !== "image") {
    return { handled: false };
  }

  if (!intent.isReport && messageType === "image") {
    return {
      handled: true,
      reply:
        language === "en"
          ? "We received the image. Please tell us what happened and where, so we can register the report properly."
          : "Recibimos la imagen. Cuentanos por favor que ocurrio y en que lugar para poder registrar el reporte correctamente.",
      needsMoreInfo: true,
    };
  }

  console.log("[citizen-reports] intent detected", {
    messageType,
    category: intent.category,
    priority: intent.priority,
    reporter: maskPhone(input.recipient),
  });
  console.log("[citizen-reports] category classified", {
    category: intent.category,
    priority: intent.priority,
    locationFound: Boolean(intent.location),
  });

  if (intent.needsLocation) {
    console.log("[citizen-reports] missing location", {
      category: intent.category,
      priority: intent.priority,
    });
  }

  console.log("[citizen-reports] creating report", {
    category: intent.category,
    priority: intent.priority,
    hasImage,
    reporter: maskPhone(input.recipient),
  });

  const report = await createCitizenReport({
    title: intent.title,
    description,
    type: intent.type,
    category: intent.category,
    priority: intent.priority,
    location: intent.location,
    source: "whatsapp",
    reporterPhone: input.recipient,
    whatsappMessageId: input.whatsappMessageId,
    whatsappFrom: input.whatsappFrom,
    whatsappRawType: input.whatsappRawType ?? messageType,
    images: input.images ?? [],
  });

  return {
    handled: true,
    reply: buildCitizenReportReply(intent, hasImage, language),
    report,
    needsMoreInfo: intent.needsLocation || !hasImage,
  };
}

function serializeCitizenReport(report: {
  id: string;
  title: string | null;
  description: string;
  type: string;
  category: string | null;
  priority: string;
  status: string;
  location: string | null;
  address: string | null;
  neighborhood: string | null;
  source: string;
  reporterPhone: string | null;
  reporterName: string | null;
  whatsappMessageId: string | null;
  whatsappFrom: string | null;
  whatsappRawType: string | null;
  images: Array<{
    id: string;
    url: string;
    filename: string | null;
    mimeType: string | null;
    size: number | null;
    createdAt: Date | string;
  }>;
  adminNotes: string | null;
  massMessageId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  reviewedAt: Date | string | null;
  resolvedAt: Date | string | null;
}): CitizenReportSummary {
  return {
    ...report,
    priority: REPORT_PRIORITIES.has(report.priority as CitizenReportPriority)
      ? (report.priority as CitizenReportPriority)
      : "normal",
    status: REPORT_STATUSES.has(report.status as CitizenReportStatus)
      ? (report.status as CitizenReportStatus)
      : "pending",
    images: report.images.map((image) => ({
      ...image,
      createdAt:
        image.createdAt instanceof Date ? image.createdAt.toISOString() : image.createdAt,
    })),
    createdAt:
      report.createdAt instanceof Date ? report.createdAt.toISOString() : report.createdAt,
    updatedAt:
      report.updatedAt instanceof Date ? report.updatedAt.toISOString() : report.updatedAt,
    reviewedAt:
      report.reviewedAt instanceof Date
        ? report.reviewedAt.toISOString()
        : report.reviewedAt,
    resolvedAt:
      report.resolvedAt instanceof Date
        ? report.resolvedAt.toISOString()
        : report.resolvedAt,
  };
}

function buildListResult(reports: CitizenReportSummary[]): CitizenReportListResult {
  return {
    reports,
    summary: {
      total: reports.length,
      pending: reports.filter((report) => report.status === "pending").length,
      urgent: reports.filter((report) => report.priority === "urgent").length,
    },
  };
}

function buildReportData(input: CreateCitizenReportInput) {
  const description = sanitizeText(input.description);

  if (!description) {
    throw new AppError("La descripcion del reporte es obligatoria.", 400);
  }

  const classification = classifyCitizenReport(description);
  const priority = input.priority ?? classification.priority;
  assertValidPriority(priority);

  return {
    title: sanitizeOptionalText(input.title ?? classification.title, 120),
    description,
    type: sanitizeText(input.type ?? classification.type, 80) || "general",
    category: sanitizeOptionalText(input.category ?? classification.category, 80),
    priority,
    status: "pending" as CitizenReportStatus,
    location: sanitizeOptionalText(input.location ?? classification.location, 120),
    address: sanitizeOptionalText(input.address, 160),
    neighborhood: sanitizeOptionalText(input.neighborhood, 100),
    source: input.source ?? "whatsapp",
    reporterPhone: sanitizeOptionalText(input.reporterPhone, 40),
    reporterName: sanitizeOptionalText(input.reporterName, 100),
    whatsappMessageId: sanitizeOptionalText(input.whatsappMessageId, 120),
    whatsappFrom: sanitizeOptionalText(input.whatsappFrom, 120),
    whatsappRawType: sanitizeOptionalText(input.whatsappRawType, 40),
    images: sanitizeImages(input.images),
  };
}

async function createCitizenReportDb(input: CreateCitizenReportInput) {
  const data = buildReportData(input);

  if (data.whatsappMessageId) {
    const duplicate = await prisma.citizenReport.findUnique({
      where: { whatsappMessageId: data.whatsappMessageId },
      include: { images: true },
    });

    if (duplicate) {
      console.log("[citizen-reports] duplicate skipped", {
        messageId: data.whatsappMessageId,
      });
      return serializeCitizenReport(duplicate);
    }
  }

  const report = await prisma.citizenReport.create({
    data: {
      ...data,
      images: {
        create: data.images,
      },
    },
    include: { images: true },
  });

  console.log("[citizen-reports] report created", {
    id: report.id,
    category: report.category,
    priority: report.priority,
    reporter: maskPhone(report.reporterPhone),
  });

  return serializeCitizenReport(report);
}

async function createCitizenReportMock(input: CreateCitizenReportInput) {
  const data = buildReportData(input);
  const store = getMockReports();

  if (data.whatsappMessageId) {
    const duplicate = store.find(
      (report) => report.whatsappMessageId === data.whatsappMessageId,
    );

    if (duplicate) {
      console.log("[citizen-reports] duplicate skipped", {
        messageId: data.whatsappMessageId,
      });
      return duplicate;
    }
  }

  const now = new Date().toISOString();
  const report: CitizenReportRecord = {
    id: createId("report"),
    title: data.title,
    description: data.description,
    type: data.type,
    category: data.category,
    priority: data.priority,
    status: data.status,
    location: data.location,
    address: data.address,
    neighborhood: data.neighborhood,
    source: data.source,
    reporterPhone: data.reporterPhone,
    reporterName: data.reporterName,
    whatsappMessageId: data.whatsappMessageId,
    whatsappFrom: data.whatsappFrom,
    whatsappRawType: data.whatsappRawType,
    images: data.images.map((image) => ({
      id: createId("image"),
      url: image.url,
      filename: image.filename,
      mimeType: image.mimeType,
      size: image.size,
      createdAt: now,
    })),
    adminNotes: null,
    massMessageId: null,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    resolvedAt: null,
  };

  store.unshift(report);
  console.log("[citizen-reports] report created", {
    id: report.id,
    category: report.category,
    priority: report.priority,
    reporter: maskPhone(report.reporterPhone),
  });
  return report;
}

function filterReports(
  reports: CitizenReportSummary[],
  filters: ListCitizenReportsFilters,
) {
  const search = normalizeText(filters.search ?? "");

  return reports
    .filter((report) => !filters.status || report.status === filters.status)
    .filter((report) => !filters.priority || report.priority === filters.priority)
    .filter((report) => !filters.category || report.category === filters.category)
    .filter((report) => !filters.type || report.type === filters.type)
    .filter((report) => {
      if (!search) return true;
      return normalizeText(
        [
          report.description,
          report.location,
          report.address,
          report.neighborhood,
          report.reporterPhone,
          report.category,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(search);
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, filters.limit ?? 100);
}

async function listCitizenReportsDb(filters: ListCitizenReportsFilters = {}) {
  const reports = await prisma.citizenReport.findMany({
    where: {
      status: filters.status,
      priority: filters.priority,
      category: filters.category,
      type: filters.type,
      OR: filters.search
        ? [
            { description: { contains: filters.search, mode: "insensitive" } },
            { location: { contains: filters.search, mode: "insensitive" } },
            { address: { contains: filters.search, mode: "insensitive" } },
            { neighborhood: { contains: filters.search, mode: "insensitive" } },
            { reporterPhone: { contains: filters.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 100,
    include: { images: true },
  });
  const serialized = reports.map(serializeCitizenReport);

  console.log("[citizen-reports] admin list loaded", {
    count: serialized.length,
  });

  return buildListResult(serialized);
}

async function listCitizenReportsMock(filters: ListCitizenReportsFilters = {}) {
  const reports = filterReports(getMockReports(), filters);
  console.log("[citizen-reports] admin list loaded", {
    count: reports.length,
    fallback: true,
  });
  return buildListResult(reports);
}

async function getCitizenReportByIdDb(id: string) {
  const report = await prisma.citizenReport.findUnique({
    where: { id },
    include: { images: true },
  });

  if (!report) {
    throw new AppError("El reporte ciudadano no existe.", 404);
  }

  return serializeCitizenReport(report);
}

async function getCitizenReportByIdMock(id: string) {
  const report = getMockReports().find((item) => item.id === id);

  if (!report) {
    throw new AppError("El reporte ciudadano no existe.", 404);
  }

  return report;
}

function getStatusDates(status: CitizenReportStatus) {
  const now = new Date();

  return {
    reviewedAt:
      status === "reviewing" ||
      status === "approved" ||
      status === "rejected" ||
      status === "converted_to_mass_message"
        ? now
        : undefined,
    resolvedAt: status === "resolved" ? now : undefined,
  };
}

async function updateCitizenReportDb(id: string, input: UpdateCitizenReportInput) {
  const data: {
    status?: CitizenReportStatus;
    adminNotes?: string | null;
    reviewedAt?: Date;
    resolvedAt?: Date;
  } = {};

  if (input.status) {
    assertValidStatus(input.status);
    data.status = input.status;
    Object.assign(data, getStatusDates(input.status));
  }

  if (input.adminNotes !== undefined) {
    data.adminNotes = sanitizeOptionalText(input.adminNotes, 1200);
  }

  const report = await prisma.citizenReport.update({
    where: { id },
    data,
    include: { images: true },
  });

  return serializeCitizenReport(report);
}

async function updateCitizenReportMock(id: string, input: UpdateCitizenReportInput) {
  const report = await getCitizenReportByIdMock(id);
  const now = new Date().toISOString();

  if (input.status) {
    assertValidStatus(input.status);
    report.status = input.status;

    if (["reviewing", "approved", "rejected", "converted_to_mass_message"].includes(input.status)) {
      report.reviewedAt = now;
    }

    if (input.status === "resolved") {
      report.resolvedAt = now;
    }
  }

  if (input.adminNotes !== undefined) {
    report.adminNotes = sanitizeOptionalText(input.adminNotes, 1200);
  }

  report.updatedAt = now;
  return report;
}

function buildMassMessageDraft(report: CitizenReportSummary) {
  const isTraffic =
    report.type === "transito" ||
    report.category === "Accidente" ||
    report.category === "Tránsito" ||
    report.category === "Vehículo mal parqueado" ||
    report.category === "Semáforo dañado" ||
    report.category === "Riesgo vial";
  const isEmergency =
    report.priority === "urgent" ||
    report.category === "Incendio" ||
    report.category === "Explosión" ||
    report.category === "Seguridad" ||
    report.category === "Emergencia" ||
    report.category === "Riesgo";
  const locationLine = report.location ? ` en ${report.location}` : "";

  if (isTraffic) {
    return {
      title: `Borrador alerta ciudadana: ${report.category ?? "Transito"}`,
      message: [
        "Alerta de transito en Rionegro",
        "",
        `Se reporta ${report.description}${locationLine}, con posible afectacion en la movilidad del sector.`,
        "",
        "Recomendamos transitar con precaucion, tomar rutas alternas si es posible y estar atentos a las indicaciones de las autoridades.",
        "",
        "Alcaldia de Rionegro.",
      ].join("\n"),
      type: "ALERT",
    };
  }

  if (isEmergency) {
    const emergencyLine =
      report.category === "Incendio"
        ? `Se reporta una posible emergencia por incendio${locationLine}.`
        : `Se reporta una posible situacion urgente${locationLine}.`;

    return {
      title: `Borrador alerta ciudadana: ${report.category ?? "Emergencia"}`,
      message: [
        "Alerta ciudadana en Rionegro",
        "",
        emergencyLine,
        "",
        "Recomendamos evitar acercarse al lugar si hay riesgo y estar atentos a las indicaciones de las autoridades.",
        "",
        "Alcaldia de Rionegro.",
      ].join("\n"),
      type: "ALERT",
    };
  }

  return {
    title: `Borrador reporte ciudadano: ${report.category ?? "General"}`,
    message: [
      "Reporte ciudadano",
      "",
      `Se informa sobre una posible situacion reportada por la comunidad${locationLine}.`,
      "",
      "El caso sera revisado por el equipo correspondiente. Recomendamos actuar con precaucion y seguir los canales oficiales.",
      "",
      "Alcaldia de Rionegro.",
    ].join("\n"),
    type: "GENERAL",
  };
}

async function convertCitizenReportToMassMessageDb(id: string) {
  const report = await getCitizenReportByIdDb(id);
  const draft = buildMassMessageDraft(report);
  const announcement = await prisma.announcement.create({
    data: {
      title: draft.title,
      message: draft.message,
      location: report.location,
      type: draft.type === "ALERT" ? "ALERT" : "GENERAL",
      customTypeLabel: "Borrador reporte ciudadano",
      scheduledAt: addDays(new Date(), 30),
      status: "SCHEDULED",
    },
    include: {
      segment: {
        select: {
          id: true,
          name: true,
          estimatedUsers: true,
        },
      },
    },
  });
  const updatedReport = await prisma.citizenReport.update({
    where: { id },
    data: {
      status: "converted_to_mass_message",
      massMessageId: announcement.id,
      reviewedAt: new Date(),
    },
    include: { images: true },
  });

  console.log("[citizen-reports] converted to mass message draft", {
    reportId: id,
    announcementId: announcement.id,
  });

  return {
    report: serializeCitizenReport(updatedReport),
    massMessageId: announcement.id,
  };
}

async function convertCitizenReportToMassMessageMock(id: string) {
  const report = await updateCitizenReportMock(id, {
    status: "converted_to_mass_message",
  });
  report.massMessageId = createId("draft");
  console.log("[citizen-reports] converted to mass message draft", {
    reportId: id,
    announcementId: report.massMessageId,
    fallback: true,
  });

  return {
    report,
    massMessageId: report.massMessageId,
  };
}

export async function createCitizenReport(input: CreateCitizenReportInput) {
  return withMockFallback(
    () => createCitizenReportDb(input),
    () => createCitizenReportMock(input),
  );
}

export async function listCitizenReports(filters: ListCitizenReportsFilters = {}) {
  return withMockFallback(
    () => listCitizenReportsDb(filters),
    () => listCitizenReportsMock(filters),
  );
}

export async function getCitizenReportById(id: string) {
  return withMockFallback(
    () => getCitizenReportByIdDb(id),
    () => getCitizenReportByIdMock(id),
  );
}

export async function updateCitizenReportStatus(
  id: string,
  status: CitizenReportStatus,
) {
  return withMockFallback(
    () => updateCitizenReportDb(id, { status }),
    () => updateCitizenReportMock(id, { status }),
  );
}

export async function addCitizenReportAdminNotes(id: string, notes: string | null) {
  return withMockFallback(
    () => updateCitizenReportDb(id, { adminNotes: notes }),
    () => updateCitizenReportMock(id, { adminNotes: notes }),
  );
}

export async function updateCitizenReport(id: string, input: UpdateCitizenReportInput) {
  return withMockFallback(
    () => updateCitizenReportDb(id, input),
    () => updateCitizenReportMock(id, input),
  );
}

export async function convertCitizenReportToMassMessage(id: string) {
  return withMockFallback(
    () => convertCitizenReportToMassMessageDb(id),
    () => convertCitizenReportToMassMessageMock(id),
  );
}

export async function countPendingCitizenReports() {
  const result = await listCitizenReports({ limit: 1000 });
  return result.summary.pending;
}

export const citizenReportInternals = {
  REPORT_STATUSES,
  REPORT_PRIORITIES,
  isAllowedImage,
  isCitizenReportMessage,
  detectCitizenReportIntent,
  extractLocationFromReportText,
  isReportInformationRequest,
  isPrivateServiceQuery,
  isHowToReportQuery,
  isActualIncidentReport,
  isAmbiguousPossibleAlert,
  extractIncidentType,
  analyzeCitizenAlertIntent,
  classifyCitizenReport,
  handleCitizenReport,
};
