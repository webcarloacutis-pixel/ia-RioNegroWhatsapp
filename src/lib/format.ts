import {
  DELIVERY_MODE_LABELS,
  STATUS_LABELS,
  formatAnnouncementTypeLabel,
} from "@/lib/constants";

export const BOGOTA_TIME_ZONE = "America/Bogota";
const BOGOTA_UTC_OFFSET = "-05:00";
const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function toDate(value: Date | string) {
  return typeof value === "string" ? new Date(value) : value;
}

function getBogotaDateTimeParts(value: Date | string) {
  const date = toDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: byType.get("year") ?? "0000",
    month: byType.get("month") ?? "00",
    day: byType.get("day") ?? "00",
    hour: byType.get("hour") ?? "00",
    minute: byType.get("minute") ?? "00",
  };
}

export function parseBogotaDateTimeLocalToUtcDate(value: string) {
  const trimmed = value.trim();
  const match = DATE_TIME_LOCAL_PATTERN.exec(trimmed);

  if (!match) {
    return new Date(Number.NaN);
  }

  return new Date(`${trimmed}:00${BOGOTA_UTC_OFFSET}`);
}

export function formatDateTimeForBogotaDisplay(value: Date | string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BOGOTA_TIME_ZONE,
  }).format(toDate(value));
}

export function formatDateTimeForDateTimeLocalBogota(value: Date | string) {
  const parts = getBogotaDateTimeParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  return formatDateTimeForBogotaDisplay(value);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: BOGOTA_TIME_ZONE,
  }).format(toDate(value));
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}

export function toDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  return formatDateTimeForDateTimeLocalBogota(value);
}

export function formatTypeLabel(value: string) {
  return formatAnnouncementTypeLabel(value);
}

export function formatStatusLabel(value: keyof typeof STATUS_LABELS) {
  return STATUS_LABELS[value] ?? value;
}

export function formatDeliveryModeLabel(
  value: keyof typeof DELIVERY_MODE_LABELS,
) {
  return DELIVERY_MODE_LABELS[value] ?? value;
}
