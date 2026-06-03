import { addDays } from "date-fns";

import { AppError } from "@/lib/errors";
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
];

const URGENT_SITUATION_PATTERN =
  /(atentado|ataque terrorista|posible atentado|explosion|balacera|disparos|incendio|fuga de gas|herido|heridos|ambulancia|derrumbe|deslizamiento)/;

const REPORT_INFORMATION_REQUEST_PATTERNS = [
  /^(?:como|donde|que|cual|puedo|debo|necesito saber|quiero saber|me puedes decir)\b.*\b(?:denuncia|denunciar|reporte|reportar|reporto)\b/,
  /^(?:como|que)\s+hago\b.*\b(?:denuncia|denunciar|reporte|reportar|hueco|accidente|choque)\b/,
  /^(?:donde|como)\b.*\b(?:transito|movilidad|inspeccion|policia|fiscalia)\b/,
];

const CLASSIFICATION_RULES: Array<{
  pattern: RegExp;
  category: string;
  priority: CitizenReportPriority;
  type: string;
}> = [
  {
    pattern: /(atentado|ataque(?: terrorista)?|posible atentado|balacera|disparos)/,
    category: "Seguridad",
    priority: "urgent",
    type: "seguridad",
  },
  {
    pattern: /(incendio)/,
    category: "Incendio",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(explosion)/,
    category: "Explosión",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(fuga de gas)/,
    category: "Emergencia",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(accidente|choque|herido|heridos|ambulancia)/,
    category: "Accidente",
    priority: "urgent",
    type: "transito",
  },
  {
    pattern: /(derrumbe|deslizamiento)/,
    category: "Riesgo",
    priority: "urgent",
    type: "emergencia",
  },
  {
    pattern: /(inundacion)/,
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
    pattern: /(trancon|tacos?|via cerrada|cierre vial|cierre de via|bloqueando la via|animal en la via)/,
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
    pattern: /(hueco)/,
    category: "Hueco en vía",
    priority: "normal",
    type: "infraestructura",
  },
  {
    pattern: /(arbol caido|se cayo.*arbol)/,
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

function inferLocation(text: string) {
  const patterns = [
    /\b(?:en|por)\s+(San Antonio|Ojos de Agua|el centro|la autopista|el aeropuerto|la glorieta|Llanogrande)\b/i,
    /\b(?:en|por)\s+((?:la\s+)?v[ií]a\s+[^.,;\n]+)/i,
    /\bv[ií]a\s+(?!esta\b|cerrada\b|bloqueada\b)([^.,;\n]+)/i,
    /\bcerca\s+(?:al|del|de)\s+([^.,;\n]+)/i,
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
        return sanitized;
      }
    }
  }

  return undefined;
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
  const infoRequest = isReportInformationRequest(normalized);
  const matchedKeywords = getMatchedReportKeywords(normalized);
  let category = "Otro";
  let priority: CitizenReportPriority = "normal";
  let type = "general";

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(normalized)) {
      category = rule.category;
      priority = rule.priority;
      type = rule.type;
      break;
    }
  }

  const isReport =
    Boolean(normalized) &&
    !infoRequest &&
    (matchedKeywords.length > 0 ||
      category !== "Otro" ||
      (messageType.toLowerCase() === "image" && normalized.length > 0));
  const location = inferLocation(text);

  return {
    isReport,
    type,
    category,
    priority,
    title: buildReportTitle(category, text),
    location,
    needsLocation: isReport && !location,
    needsImage: isReport,
    isUrgentSituation: URGENT_SITUATION_PATTERN.test(normalized),
    matchedKeywords,
  };
}

export function classifyCitizenReport(text: string) {
  return detectCitizenReportIntent(text);
}

function buildCitizenReportReply(intent: CitizenReportIntent, hasImage: boolean) {
  if (intent.isUrgentSituation) {
    const emergencyLine = getEmergencyContactReference();

    if (intent.needsLocation) {
      return [
        "Gracias por avisar. Registramos el reporte como posible situación urgente para revisión.",
        "",
        `Dime por favor la ubicación exacta o el sector donde ocurre. Si hay personas heridas o riesgo inmediato, comunícate también con ${emergencyLine}.`,
      ].join("\n");
    }

    return [
      "Gracias por avisar. Registramos el reporte como posible situación urgente para revisión.",
      "",
      `Si hay personas heridas o riesgo inmediato, por favor comunícate también con ${emergencyLine}.`,
    ].join("\n");
  }

  if (intent.needsLocation) {
    if (intent.category === "Accidente") {
      return "Gracias por reportarlo. Para registrarlo bien, dime por favor la ubicación exacta o el sector donde ocurrió el accidente. Si puedes, envía también una foto del lugar.";
    }

    return "Gracias por reportarlo. Para registrarlo correctamente, dime por favor en qué sector o dirección ocurrió. Si puedes, envía también una foto del lugar.";
  }

  if (hasImage) {
    return [
      "Gracias por reportarlo. Ya recibimos la información y la imagen del suceso. El caso queda registrado para revisión del equipo administrativo.",
      "",
      "Si tienes otro dato, como un punto de referencia más exacto, puedes enviarlo por aquí.",
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
        "Recibimos la imagen. Cuéntanos por favor qué ocurrió y en qué lugar para poder registrar el reporte correctamente.",
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
        "Recibimos la imagen. Cuéntanos por favor qué ocurrió y en qué lugar para poder registrar el reporte correctamente.",
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
    reply: buildCitizenReportReply(intent, hasImage),
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
  isReportInformationRequest,
  classifyCitizenReport,
  handleCitizenReport,
};
