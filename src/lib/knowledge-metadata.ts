import type { KnowledgeEntrySummary } from "@/lib/types";

const STOP_WORDS = new Set([
  "a",
  "al",
  "como",
  "con",
  "cual",
  "cuales",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "es",
  "esta",
  "las",
  "la",
  "los",
  "me",
  "mi",
  "para",
  "por",
  "queda",
  "que",
  "se",
  "si",
  "un",
  "una",
  "y",
]);

const LOCATION_PATTERNS = [
  /\b(donde|ubicacion|direccion|dirrecion|direcion|llego|llegar|queda|esta)\b/,
];

const INTENT_PATTERNS: Array<[string, RegExp]> = [
  ["LOCATION", /\b(donde|ubicacion|direccion|dirrecion|direcion|llego|llegar|queda|esta)\b/],
  ["HOURS", /\b(horario|horarios|atiende|atienden|abierto|abierta|cierra|abre)\b/],
  ["CONTACT", /\b(contacto|telefono|correo|email|whatsapp|numero)\b/],
  ["PAYMENT", /\b(pago|pagar|pagos|recibo|factura)\b/],
  ["TAX", /\b(predial|impuesto|rentas|hacienda)\b/],
  ["PQRS", /\b(pqrs|peticion|queja|reclamo|solicitud)\b/],
  ["MOBILITY", /\b(movilidad|transito|comparendo|multa|licencia)\b/],
  ["HEALTH", /\b(salud|hospital|vacuna|vacunacion)\b/],
  ["EDUCATION", /\b(educacion|colegio|docente|estudiante)\b/],
  ["EVENT", /\b(evento|agenda|actividad|programacion)\b/],
  ["EMERGENCY", /\b(emergencia|urgencia|accidente|incendio)\b/],
];

const CATEGORY_LABELS: Record<string, string> = {
  ENVIRONMENT: "Ambiente",
  LOCATION: "Ubicacion",
  CONTACT: "Contacto",
  HEALTH: "Salud",
  EDUCATION: "Educacion",
  CULTURE: "Cultura",
  SPORTS: "Deportes",
  SECURITY: "Seguridad",
  EVENT: "Eventos",
  PROGRAM: "Programas",
  TREASURY: "Hacienda",
  CADASTRE: "Catastro",
};

const INTENT_LABELS: Record<string, string> = {
  LOCATION: "Ubicacion",
  HOURS: "Horarios",
  CONTACT: "Contacto",
  PROCEDURE: "Tramite",
  PAYMENT: "Pago",
  TAX: "Impuesto",
  PQRS: "PQRS",
  SECRETARY: "Secretaria",
  DEPENDENCY: "Dependencia",
  MOBILITY: "Movilidad",
  HEALTH: "Salud",
  EDUCATION: "Educacion",
  CULTURE: "Cultura",
  SPORTS: "Deportes",
  SECURITY: "Seguridad",
  ENVIRONMENT: "Ambiente",
  INFRASTRUCTURE: "Infraestructura",
  CADASTRE: "Catastro",
  TREASURY: "Hacienda",
  EVENT: "Evento",
  NEWS: "Noticia",
  PROGRAM: "Programa",
  LEGAL: "Legal",
  ALERT: "Alerta",
  EMERGENCY: "Emergencia",
  PRIVATE_SERVICE_QUERY: "Servicio privado",
  WEATHER_QUERY: "Clima",
  OUT_OF_SCOPE: "Fuera de alcance",
  UNKNOWN: "Desconocido",
};

export type KnowledgeMetadataInput = {
  question: string;
  answer: string;
  category: string;
  userAliases?: string[];
};

export type GeneratedKnowledgeMetadata = {
  tags: string[];
  aliases: string[];
  intent?: string;
  confidence: number;
  sourceType: string;
  sourceName: string;
  isOfficial: boolean;
  needsReview: boolean;
};

export function normalizeKnowledgeQuery(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(dirrecion|direcion)\b/g, "direccion")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getKnowledgeCategoryLabel(category: string | null | undefined) {
  if (!category) return "Sin categoria";
  return CATEGORY_LABELS[category] ?? category;
}

export function getKnowledgeIntentLabel(intent: string | null | undefined) {
  if (!intent) return "Sin intencion";
  return INTENT_LABELS[intent] ?? intent;
}

function unique(items: string[], max = 30) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = normalizeKnowledgeQuery(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) break;
  }

  return result;
}

function tokensFor(text: string) {
  return normalizeKnowledgeQuery(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function inferIntent(text: string, category: string) {
  const normalized = normalizeKnowledgeQuery(`${text} ${category}`);
  const match = INTENT_PATTERNS.find(([, pattern]) => pattern.test(normalized));
  return match?.[0];
}

function extractSubject(question: string) {
  let subject = normalizeKnowledgeQuery(question)
    .replace(
      /^(sabes donde esta|sabes donde queda|donde queda|donde esta|ubicacion de|ubicacion del|ubicacion|direccion de|direccion del|direccion|como llego a|como llegar a|queda|esta)\s+/,
      "",
    )
    .replace(/^(el|la|los|las|un|una)\s+/, "")
    .trim();

  if (!subject) {
    subject = normalizeKnowledgeQuery(question);
  }

  return subject;
}

function withoutBusinessType(subject: string) {
  return subject
    .replace(/^(restaurante|comercio|tienda|negocio|local|sede|oficina)\s+/, "")
    .trim();
}

export function generateKnowledgeMetadata(input: KnowledgeMetadataInput): GeneratedKnowledgeMetadata {
  const normalizedQuestion = normalizeKnowledgeQuery(input.question);
  const normalizedCategory = normalizeKnowledgeQuery(input.category);
  const subject = extractSubject(input.question);
  const shortSubject = withoutBusinessType(subject);
  const isLocation = LOCATION_PATTERNS.some((pattern) =>
    pattern.test(normalizeKnowledgeQuery(`${input.question} ${input.category}`)),
  );

  const aliasCandidates = [
    normalizedQuestion,
    ...(input.userAliases ?? []),
    subject,
    shortSubject,
  ];

  if (subject) {
    aliasCandidates.push(
      `donde queda ${subject}`,
      `donde esta ${subject}`,
      `ubicacion ${subject}`,
      `direccion ${subject}`,
      `como llego a ${subject}`,
      `${subject} direccion`,
    );
  }

  if (shortSubject && shortSubject !== subject) {
    aliasCandidates.push(
      `donde queda ${shortSubject}`,
      `donde esta ${shortSubject}`,
      `ubicacion ${shortSubject}`,
      `direccion ${shortSubject}`,
      `como llego a ${shortSubject}`,
    );
  }

  const tagCandidates = [
    normalizedCategory,
    subject,
    shortSubject,
    ...tokensFor(`${input.question} ${input.answer} ${input.category}`),
  ];

  if (isLocation) {
    tagCandidates.push("ubicacion", "direccion");
  }

  return {
    tags: unique(tagCandidates, 18),
    aliases: unique(aliasCandidates, 24),
    intent: inferIntent(`${input.question} ${input.answer}`, input.category),
    confidence: 0.8,
    sourceType: "manual_admin",
    sourceName: "Panel admin",
    isOfficial: false,
    needsReview: false,
  };
}

function tokenOverlapScore(queryTokens: string[], text: string, weight: number) {
  const normalized = normalizeKnowledgeQuery(text);
  if (!normalized) return 0;

  return queryTokens.reduce((score, token) => {
    return normalized.includes(token) ? score + weight : score;
  }, 0);
}

export function scoreKnowledgeEntry(entry: KnowledgeEntrySummary, query: string) {
  const normalizedQuery = normalizeKnowledgeQuery(query);
  const queryTokens = tokensFor(query);

  if (!normalizedQuery || !entry.isActive) return 0;

  const normalizedQuestion = normalizeKnowledgeQuery(entry.question);
  const normalizedAliases = entry.aliases.map(normalizeKnowledgeQuery);
  const normalizedTags = entry.tags.map(normalizeKnowledgeQuery);
  let score = entry.confidence * 20;

  if (normalizedQuestion === normalizedQuery) score += 130;
  if (normalizedAliases.some((alias) => alias === normalizedQuery)) score += 125;

  if (normalizedQuestion.includes(normalizedQuery) || normalizedQuery.includes(normalizedQuestion)) {
    score += 80;
  }

  if (
    normalizedAliases.some(
      (alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias),
    )
  ) {
    score += 85;
  }

  score += tokenOverlapScore(queryTokens, entry.question, 18);
  score += tokenOverlapScore(queryTokens, entry.aliases.join(" "), 20);
  score += tokenOverlapScore(queryTokens, entry.tags.join(" "), 16);
  score += tokenOverlapScore(queryTokens, entry.category, 10);
  score += tokenOverlapScore(queryTokens, entry.intent ?? "", 8);
  score += tokenOverlapScore(queryTokens, entry.shortAnswer ?? "", 6);
  score += tokenOverlapScore(queryTokens, entry.answer, 4);

  if (normalizedTags.some((tag) => normalizedQuery.includes(tag))) {
    score += 16;
  }

  if (entry.isOfficial) score += 8;
  if (entry.needsReview) score -= 10;

  return Math.max(0, score);
}
