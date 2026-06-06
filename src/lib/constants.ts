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
  "SENDING",
  "SENT",
  "SENT_REAL",
  "SENT_SIMULATED",
  "BLOCKED_BY_SAFE_MODE",
  "FAILED",
  "CANCELLED",
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
  "Ubicacion",
  "Restaurantes",
  "Comercio",
  "Turismo",
  "Tramites",
  "Pagos",
  "Predial",
  "Movilidad",
  "Salud",
  "Educacion",
  "Cultura",
  "Deportes",
  "Seguridad",
  "Eventos",
  "Programas",
  "Alcaldia",
  "Contacto",
  "Horarios",
  "Industria y comercio",
  "PQRS",
  "Dependencias",
  "Secretarias",
  "Sedes",
  "Transito",
  "Ambiente",
  "Infraestructura",
  "Planeacion",
  "Catastro",
  "Hacienda",
  "Emprendimiento",
  "Noticias",
  "Normativa",
  "Contratacion",
  "Participacion ciudadana",
  "Alertas ciudadanas",
  "Emergencias",
  "Servicios privados no oficiales",
  "Clima",
  "Otro",
] as const;

export const KNOWLEDGE_INTENT_SUGGESTIONS = [
  "LOCATION",
  "HOURS",
  "CONTACT",
  "PROCEDURE",
  "PAYMENT",
  "TAX",
  "PQRS",
  "SECRETARY",
  "DEPENDENCY",
  "MOBILITY",
  "HEALTH",
  "EDUCATION",
  "CULTURE",
  "SPORTS",
  "SECURITY",
  "ENVIRONMENT",
  "INFRASTRUCTURE",
  "CADASTRE",
  "TREASURY",
  "EVENT",
  "NEWS",
  "PROGRAM",
  "LEGAL",
  "ALERT",
  "EMERGENCY",
  "PRIVATE_SERVICE_QUERY",
  "WEATHER_QUERY",
  "OUT_OF_SCOPE",
  "UNKNOWN",
] as const;

export const KNOWLEDGE_SOURCE_TYPES = [
  "manual_admin",
  "official_seed",
  "official_website",
  "scraped_official",
  "external_official",
  "derived_fallback",
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
  SENDING: "Enviando",
  SENT: "Enviado",
  SENT_REAL: "Enviado real",
  SENT_SIMULATED: "Simulado",
  BLOCKED_BY_SAFE_MODE: "Bloqueado por modo seguro",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
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
