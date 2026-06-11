import type {
  CitizenReportPriority,
  CitizenReportSummary,
  PendingCitizenReportMemory,
} from "@/lib/types";
import { detectUserLanguage, type SupportedLanguage } from "@/lib/language";
import { cleanFinalReplyText, repairMojibake } from "@/lib/text-encoding";
import {
  addCitizenReportImages,
  updateCitizenReportLocation,
  type CitizenReportImageInput,
  type CitizenReportIntent,
} from "@/server/citizen-report-service";

type AddressDetection = {
  isAddressLike: boolean;
  normalizedAddress?: string;
  sector?: string;
  confidence: number;
};

type PendingReportFollowupResult =
  | {
      handled: true;
      reply: string;
      language: SupportedLanguage;
      pendingCitizenReport: PendingCitizenReportMemory;
      normalizedAddress?: string;
      attachedPhoto?: boolean;
      completedWithoutPhoto?: boolean;
    }
  | {
      handled: false;
    };

const ACTIVE_PENDING_STATUSES = new Set([
  "collecting_location",
  "collecting_photo",
  "waiting_confirmation",
  "ready",
]);

const KNOWN_SECTORS = [
  ["el porvenir", "El Porvenir"],
  ["san antonio", "San Antonio"],
  ["llanogrande", "Llanogrande"],
  ["centro", "Centro"],
  ["ojos de agua", "Ojos de Agua"],
  ["aeropuerto", "Aeropuerto"],
  ["parque", "parque"],
] as const;

function normalizeForRules(text: string) {
  return repairMojibake(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}#\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAddressInput(text: string) {
  return repairMojibake(text)
    .replace(/[\u00b7\u00c2]/g, " ")
    .replace(/["'`´“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRoadPrefix(prefix: string) {
  const normalized = normalizeForRules(prefix);

  if (["cra", "cr", "carrera"].includes(normalized)) return "Cra";
  if (["cl", "cll", "calle"].includes(normalized)) return "Calle";
  if (["av", "avenida"].includes(normalized)) return "Av";
  return prefix.trim();
}

function formatAddressPart(value: string) {
  return value.trim().toUpperCase();
}

function findKnownSector(text: string) {
  const normalized = normalizeForRules(text);
  const matched = KNOWN_SECTORS.find(([key]) =>
    new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`).test(normalized),
  );

  return matched?.[1];
}

export function detectAddressOrLocationFollowup(text: string): AddressDetection {
  const cleaned = cleanAddressInput(text);
  const normalized = normalizeForRules(cleaned);

  if (!normalized) {
    return { isAddressLike: false, confidence: 0 };
  }

  const streetMatch = cleaned.match(
    /\b(cra|cr|carrera|calle|cll|cl|avenida|av)\.?\s*(\d+[a-z]?)\s*(?:#|n(?:o|ro)?\.?)?\s*(\d+[a-z]?)\s*[- ]\s*(\d+[a-z]?)\b/i,
  );

  if (streetMatch) {
    const [, prefix, main, secondary, plate] = streetMatch;
    return {
      isAddressLike: true,
      normalizedAddress: `${formatRoadPrefix(prefix)} ${formatAddressPart(
        main,
      )} #${formatAddressPart(secondary)}-${formatAddressPart(plate)}`,
      sector: findKnownSector(cleaned),
      confidence: 0.95,
    };
  }

  const sector = findKnownSector(cleaned);

  if (sector) {
    return {
      isAddressLike: true,
      normalizedAddress: sector,
      sector,
      confidence: 0.76,
    };
  }

  if (
    /\b(?:cerca\s+(?:al|del|de)|al\s+lado\s+de|frente\s+(?:al|a\s+la|a)|por\s+la\s+via\s+al|por\s+la\s+via|via\s+al|en\s+la\s+entrada)\b/.test(
      normalized,
    )
  ) {
    return {
      isAddressLike: true,
      normalizedAddress: cleaned,
      confidence: 0.68,
    };
  }

  return {
    isAddressLike: false,
    confidence: 0.1,
  };
}

export function detectShortFollowUp(text: string) {
  const normalized = normalizeForRules(text).replace(/\s+/g, " ").trim();

  if (!normalized) return false;

  if (
    /^(si|no|claro|alli|ahi|where|where is|and where|cual|cu[aá]l|horario|direccion|ubicacion|address|location|hours|what time|telefono|phone|foto|photo|te mando foto|send photo|no tengo foto|i do not have a photo|en el porvenir)$/.test(
      normalized,
    )
  ) {
    return true;
  }

  return normalized.split(" ").length <= 4 && detectAddressOrLocationFollowup(text).isAddressLike;
}

function isNoPhotoMessage(text: string) {
  const normalized = normalizeForRules(text);
  return /\b(?:no\s+tengo\s+foto|sin\s+foto|no\s+puedo\s+enviar\s+foto|i\s+do\s+not\s+have\s+(?:a\s+)?photo|no\s+photo)\b/.test(
    normalized,
  );
}

function describeReport(pending: PendingCitizenReportMemory, language: SupportedLanguage) {
  const category = normalizeForRules(pending.category ?? pending.type);

  if (language === "en") {
    if (category.includes("incendio") || category.includes("fire")) return "fire report";
    if (category.includes("accidente")) return "accident report";
    if (category.includes("arbol")) return "fallen tree report";
    return "citizen report";
  }

  if (category.includes("incendio") || category.includes("fire")) return "reporte del incendio";
  if (category.includes("accidente")) return "reporte del accidente";
  if (category.includes("arbol")) return "reporte del arbol caido";
  return "reporte ciudadano";
}

function buildLocationUpdatedReply(input: {
  pending: PendingCitizenReportMemory;
  address: string;
  language: SupportedLanguage;
}) {
  const reportLabel = describeReport(input.pending, input.language);
  const sector = input.pending.sector ?? input.pending.location;
  const sectorLine = sector ? ` en ${sector}` : "";

  if (input.language === "en") {
    return cleanFinalReplyText(
      `Perfect, I added that address to the ${reportLabel}${sectorLine}: ${input.address}. If you can, please send a photo of the place. If anyone is at risk, also contact emergency services.`,
      "en",
    );
  }

  return cleanFinalReplyText(
    `Perfecto, ya agregue esa direccion al ${reportLabel}${sectorLine}: ${input.address}. Si puedes, envia una foto del lugar. Si hay personas en riesgo, comunicate tambien con emergencias.`,
    "es",
  );
}

function buildPhotoAttachedReply(language: SupportedLanguage) {
  return cleanFinalReplyText(
    language === "en"
      ? "Done, I received the photo and added it to the report. Thank you for helping report it."
      : "Listo, recibi la foto y quedo agregada al reporte. Gracias por ayudar a reportarlo.",
    language,
  );
}

function buildNoPhotoReply(language: SupportedLanguage) {
  return cleanFinalReplyText(
    language === "en"
      ? "Done, the report is registered without a photo. Thank you for letting us know."
      : "Listo, el reporte queda registrado sin foto. Gracias por avisar.",
    language,
  );
}

function buildNeedLocationAgainReply(language: SupportedLanguage) {
  return cleanFinalReplyText(
    language === "en"
      ? "I still need the exact address or a clearer reference point to complete the report."
      : "Todavia necesito la direccion exacta o una referencia mas clara para completar el reporte.",
    language,
  );
}

export function buildPendingCitizenReport(input: {
  report?: CitizenReportSummary;
  intent: CitizenReportIntent;
  description: string;
  language: SupportedLanguage;
  hasImage?: boolean;
  now?: Date;
}): PendingCitizenReportMemory {
  const sector = input.report?.location ?? input.intent.location;
  const needsLocation = !input.report?.address;
  const needsPhoto = !input.hasImage;

  return {
    reportId: input.report?.id,
    type: input.intent.type,
    category: input.intent.category,
    priority: input.intent.priority as CitizenReportPriority,
    description: input.description,
    location: sector ?? undefined,
    sector: sector ?? undefined,
    address: input.report?.address ?? undefined,
    needsLocation,
    needsPhoto,
    status: needsLocation ? "collecting_location" : needsPhoto ? "collecting_photo" : "ready",
    startedAt: (input.now ?? new Date()).toISOString(),
    language: input.language,
  };
}

export async function handlePendingCitizenReportFollowup(input: {
  pendingCitizenReport?: PendingCitizenReportMemory | null;
  text: string;
  hasImage?: boolean;
  images?: CitizenReportImageInput[];
  language?: SupportedLanguage;
}): Promise<PendingReportFollowupResult> {
  const pending = input.pendingCitizenReport;

  if (!pending || !ACTIVE_PENDING_STATUSES.has(pending.status)) {
    return { handled: false };
  }

  const language =
    input.language ??
    pending.language ??
    detectUserLanguage({ text: input.text || pending.description }).language;
  const text = repairMojibake(input.text).trim();

  if (input.hasImage && input.images?.length) {
    if (pending.reportId) {
      await addCitizenReportImages(pending.reportId, input.images);
    }

    console.log("[eva-report] photo_attached", {
      reportStatus: "submitted",
      hasReportId: Boolean(pending.reportId),
    });

    return {
      handled: true,
      reply: buildPhotoAttachedReply(language),
      language,
      attachedPhoto: true,
      pendingCitizenReport: {
        ...pending,
        needsPhoto: false,
        status: "submitted",
      },
    };
  }

  if (text && isNoPhotoMessage(text)) {
    console.log("[eva-report] completed_without_photo", {
      reportStatus: "submitted",
      hasReportId: Boolean(pending.reportId),
    });

    return {
      handled: true,
      reply: buildNoPhotoReply(language),
      language,
      completedWithoutPhoto: true,
      pendingCitizenReport: {
        ...pending,
        needsPhoto: false,
        status: "submitted",
      },
    };
  }

  if (pending.status === "collecting_location") {
    const detected = detectAddressOrLocationFollowup(text);

    if (!detected.isAddressLike) {
      if (detectShortFollowUp(text)) {
        return {
          handled: true,
          reply: buildNeedLocationAgainReply(language),
          language,
          pendingCitizenReport: pending,
        };
      }

      return { handled: false };
    }

    const address = detected.normalizedAddress ?? text;
    const sector = detected.sector ?? pending.sector ?? pending.location;

    if (pending.reportId) {
      await updateCitizenReportLocation(pending.reportId, {
        address,
        location: sector ?? pending.location,
        neighborhood: sector,
      });
    }

    console.log("[eva-report] followup_location_detected", {
      confidence: detected.confidence,
      reportStatus: pending.needsPhoto ? "collecting_photo" : "ready",
    });
    console.log("[eva-report] report_updated_with_location", {
      hasReportId: Boolean(pending.reportId),
      reportStatus: pending.needsPhoto ? "collecting_photo" : "ready",
    });

    const nextPending: PendingCitizenReportMemory = {
      ...pending,
      address,
      sector,
      location: sector ?? pending.location,
      needsLocation: false,
      status: pending.needsPhoto ? "collecting_photo" : "ready",
    };

    return {
      handled: true,
      reply: buildLocationUpdatedReply({
        pending: nextPending,
        address,
        language,
      }),
      language,
      normalizedAddress: address,
      pendingCitizenReport: nextPending,
    };
  }

  if (detectShortFollowUp(text)) {
    return {
      handled: true,
      reply:
        pending.status === "collecting_photo"
          ? cleanFinalReplyText(
              language === "en"
                ? "If you can, send a photo of the place. If you do not have one, write: no photo."
                : "Si puedes, envia una foto del lugar. Si no tienes una, escribe: no tengo foto.",
              language,
            )
          : buildNeedLocationAgainReply(language),
      language,
      pendingCitizenReport: pending,
    };
  }

  return { handled: false };
}
