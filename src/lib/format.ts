import {
  DELIVERY_MODE_LABELS,
  STATUS_LABELS,
  formatAnnouncementTypeLabel,
} from "@/lib/constants";

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(date);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}

export function toDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
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
