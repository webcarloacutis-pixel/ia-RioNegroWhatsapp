import { addDays } from "date-fns";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  CitizenReportListResult,
  CitizenReportPriority,
  CitizenReportStatus,
  CitizenReportSummary,
} from "@/lib/types";

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
  "emergencia",
  "accidente",
  "choque",
  "trancon",
  "trancón",
  "via cerrada",
  "vía cerrada",
  "carro mal parqueado",
  "moto mal parqueada",
  "mal parqueado",
  "invadiendo el anden",
  "invadiendo el andén",
  "semaforo dañado",
  "semáforo dañado",
  "hueco",
  "arbol caido",
  "árbol caído",
  "inundacion",
  "inundación",
  "poste caido",
  "poste caído",
  "basura",
  "ruido",
  "anden",
  "andén",
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
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
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
    /\b(?:en|por|cerca de|cerca al|cerca del|frente a|via|vía)\s+([^.,;]+)/i,
    /\b(?:sector|zona|barrio)\s+([^.,;]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();

    if (value && value.length >= 3) {
      return sanitizeText(value, 120);
    }
  }

  return undefined;
}

export function isCitizenReportMessage(text: string) {
  const normalized = normalizeText(text);
  return REPORT_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

export function classifyCitizenReport(text: string): {
  type: string;
  category: string;
  priority: CitizenReportPriority;
  title: string;
  location?: string;
} {
  const normalized = normalizeText(text);
  let category = "Otro";
  let priority: CitizenReportPriority = "normal";
  let type = "general";

  if (/(accidente|choque|herido|ambulancia)/.test(normalized)) {
    category = "Accidente";
    priority = "urgent";
    type = "transito";
  } else if (/(trancon|via cerrada|vía cerrada|bloqueando la via|bloqueando la vía)/.test(normalized)) {
    category = "Tránsito";
    priority = "high";
    type = "transito";
  } else if (/(mal parquead|anden|andén|invadiendo)/.test(normalized)) {
    category = "Vehículo mal parqueado";
    priority = "normal";
    type = "transito";
  } else if (/(semaforo|semáforo)/.test(normalized)) {
    category = "Semáforo dañado";
    priority = "high";
    type = "transito";
  } else if (normalized.includes("hueco")) {
    category = "Hueco en vía";
    priority = "normal";
    type = "infraestructura";
  } else if (/(arbol caido|árbol caído)/.test(normalized)) {
    category = "Árbol caído";
    priority = "high";
    type = "emergencia";
  } else if (/(inundacion|inundación)/.test(normalized)) {
    category = "Inundación";
    priority = "urgent";
    type = "emergencia";
  } else if (/basura/.test(normalized)) {
    category = "Basuras";
    priority = "normal";
    type = "convivencia";
  } else if (/ruido/.test(normalized)) {
    category = "Ruido";
    priority = "low";
    type = "convivencia";
  } else if (/emergencia|poste caido|poste caído/.test(normalized)) {
    category = "Emergencia";
    priority = "urgent";
    type = "emergencia";
  }

  return {
    type,
    category,
    priority,
    title: `${category}: ${sanitizeText(text, 70)}`,
    location: inferLocation(text),
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
    report.category === "Semáforo dañado";
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
  classifyCitizenReport,
};
