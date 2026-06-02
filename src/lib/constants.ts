export const DEFAULT_ANNOUNCEMENT_TYPES = [
  "EVENT",
  "NEWS",
  "ROAD_CLOSURE",
  "PUBLIC_WORK",
  "ALERT",
  "GENERAL",
] as const;

export const ANNOUNCEMENT_TYPE_VALUES = DEFAULT_ANNOUNCEMENT_TYPES;

export const ANNOUNCEMENT_STATUS_VALUES = [
  "DRAFT",
  "SCHEDULED",
  "SENT",
  "SENT_REAL",
  "SENT_SIMULATED",
  "BLOCKED_BY_SAFE_MODE",
  "FAILED",
] as const;

export const DELIVERY_MODE_VALUES = ["DEMO", "MANUAL", "SCHEDULED"] as const;

export const ASSISTANT_TOPIC_VALUES = [
  "GREETING",
  "ALERTS",
  "EVENTS",
  "ROAD_CLOSURES",
  "PUBLIC_WORKS",
  "NEWS",
  "INSTITUTIONAL",
  "FAQ",
  "DENUNCIAS",
  "OVERVIEW",
  "OUT_OF_SCOPE",
  "UNKNOWN",
] as const;

export const ASSISTANT_ROUTE_VALUES = [
  "RULE_BASED",
  "KNOWLEDGE_BASE",
  "ANNOUNCEMENTS",
  "HYBRID_AI",
  "FALLBACK",
] as const;

export const KNOWLEDGE_CATEGORY_SUGGESTIONS = [
  "Tramites",
  "Movilidad",
  "Eventos",
  "Servicios",
  "Emergencias",
] as const;

export const ADMIN_DEMO_EMAIL = "admin@rionegro.gov";
export const ADMIN_DEMO_PASSWORD = "admin123";

export const TYPE_LABELS: Record<(typeof DEFAULT_ANNOUNCEMENT_TYPES)[number], string> = {
  EVENT: "Evento",
  NEWS: "Noticia",
  ROAD_CLOSURE: "Cierre vial",
  PUBLIC_WORK: "Obra",
  ALERT: "Alerta",
  GENERAL: "General",
};

export function normalizeAnnouncementType(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toUpperCase();
}

export function formatAnnouncementTypeLabel(value: string) {
  const normalized = normalizeAnnouncementType(value);
  const knownLabel = TYPE_LABELS[normalized as keyof typeof TYPE_LABELS];

  if (knownLabel) {
    return knownLabel;
  }

  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const STATUS_LABELS: Record<
  (typeof ANNOUNCEMENT_STATUS_VALUES)[number],
  string
> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programado",
  SENT: "Enviado",
  SENT_REAL: "Enviado real",
  SENT_SIMULATED: "Simulado",
  BLOCKED_BY_SAFE_MODE: "Bloqueado por modo seguro",
  FAILED: "Fallido",
};

export const DELIVERY_MODE_LABELS: Record<
  (typeof DELIVERY_MODE_VALUES)[number],
  string
> = {
  DEMO: "Demo",
  MANUAL: "Enviar ahora",
  SCHEDULED: "Programado",
};

export const ASSISTANT_TOPIC_LABELS: Record<
  (typeof ASSISTANT_TOPIC_VALUES)[number],
  string
> = {
  GREETING: "Saludo",
  ALERTS: "Alertas",
  EVENTS: "Eventos",
  ROAD_CLOSURES: "Cierres viales",
  PUBLIC_WORKS: "Obras",
  NEWS: "Noticias",
  INSTITUTIONAL: "Informacion institucional",
  FAQ: "Preguntas frecuentes",
  DENUNCIAS: "Denuncias",
  OVERVIEW: "Resumen general",
  OUT_OF_SCOPE: "Fuera de alcance",
  UNKNOWN: "Sin clasificar",
};

export const ASSISTANT_ROUTE_LABELS: Record<
  (typeof ASSISTANT_ROUTE_VALUES)[number],
  string
> = {
  RULE_BASED: "Reglas",
  KNOWLEDGE_BASE: "Base de conocimiento",
  ANNOUNCEMENTS: "Comunicados",
  HYBRID_AI: "Respuesta conversacional",
  FALLBACK: "Orientacion general",
};

export const DEFAULT_AUDIENCE_SIZE = 1250;
