import type { KnowledgeEntrySummary } from "@/lib/types";
import type { SupportedLanguage } from "@/lib/language";
import { repairMojibake } from "@/lib/text-encoding";

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

export const KNOWLEDGE_BILINGUAL_TERMS = {
  cityHall: ["city hall", "mayor's office", "municipal office", "town hall", "alcaldia", "palacio municipal"],
  address: ["address", "location", "where is", "where can", "direccion", "ubicacion", "donde queda"],
  hours: ["opening hours", "business hours", "schedule", "what time", "horario", "atencion"],
  taxes: ["taxes", "property tax", "municipal taxes", "predial", "impuesto predial", "rentas"],
  mobility: ["mobility", "traffic", "transit", "driver license", "movilidad", "transito", "comparendo"],
  citizenReport: ["citizen report", "report an incident", "complaint", "denuncia", "reporte ciudadano", "alerta"],
  procedure: ["procedure", "process", "paperwork", "tramite", "tramites", "requisito"],
  contact: ["contact", "email", "phone", "telefono", "correo", "contacto"],
  pqrs: ["complaint", "request", "claim", "petition", "pqrs", "pqrsd", "queja", "reclamo", "solicitud"],
  emergency: ["emergency", "accident", "fire", "flood", "accidente", "incendio", "inundacion"],
  shoppingCenter: ["shopping center", "mall", "commercial center", "centro comercial", "c.c.", "cc"],
  sanNicolas: [
    "san nicolas",
    "san nicola",
    "san nicolas shopping center",
    "san nicolas mall",
    "centro comercial san nicolas",
    "c.c. san nicolas",
    "cc san nicolas",
  ],
} as const;

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

export function expandKnowledgeQueryForSearch(text: string) {
  const normalized = normalizeKnowledgeQuery(text);
  const additions: string[] = [];

  for (const terms of Object.values(KNOWLEDGE_BILINGUAL_TERMS)) {
    const normalizedTerms = terms.map(normalizeKnowledgeQuery);
    const matched = normalizedTerms.some((term) => {
      return term && (normalized.includes(term) || term.includes(normalized));
    });

    if (matched) {
      additions.push(...normalizedTerms);
    }
  }

  return unique([normalized, ...additions], 80).join(" ");
}

export function detectKnowledgeTextLanguage(text: string): SupportedLanguage {
  const normalized = normalizeKnowledgeQuery(text);
  let englishScore = 0;
  let spanishScore = 0;

  for (const hint of ["city hall", "opening hours", "address", "phone", "email", "property tax", "procedure"]) {
    if (normalized.includes(hint)) englishScore += hint.includes(" ") ? 2 : 1;
  }

  for (const hint of ["alcaldia", "horario", "direccion", "telefono", "correo", "predial", "tramite"]) {
    if (normalized.includes(hint)) spanishScore += hint.includes(" ") ? 2 : 1;
  }

  if (/\b(the|and|from|where|what|how|office|hours)\b/.test(normalized)) englishScore += 2;
  if (/\b(el|la|los|las|de|del|donde|como|que|cual)\b/.test(normalized)) spanishScore += 2;

  return englishScore > spanishScore ? "en" : "es";
}

function buildSanNicolasEnglishAnswer(entry: Pick<KnowledgeEntrySummary, "question" | "answer">) {
  const text = repairMojibake(`${entry.question}. ${entry.answer}`);
  const normalized = normalizeKnowledgeQuery(text);

  if (!/\bsan nicolas\b|\bsan nicola\b/.test(normalized)) {
    return null;
  }

  const addressMatch = text.match(/\b(Calle\s*\d+\s*#?\s*\d+\s*[- ]\s*\d+)\b/i);

  if (!addressMatch?.[1]) {
    return null;
  }

  const address = addressMatch[1].replace(/\s*#\s*/g, " #").replace(/\s*-\s*/g, "-");
  const sectorMatch = text.match(/\b(?:sector|referencia:\s*sector)\s+(El\s+Porvenir|San\s+Antonio|Llanogrande|Centro)\b/i);
  const sector = sectorMatch?.[1]?.replace(/\s+/g, " ").trim();

  return sector
    ? `San Nicol\u00e1s Shopping Center is located at ${address}, in the ${sector} sector of Rionegro.`
    : `San Nicol\u00e1s Shopping Center is located at ${address}, in Rionegro.`;
}

export function localizeKnowledgeAnswerForLanguage(
  entry: Pick<
    KnowledgeEntrySummary,
    "question" | "answer" | "shortAnswer" | "questionEn" | "answerEn" | "shortAnswerEn"
  >,
  language: SupportedLanguage,
) {
  if (language === "en" && (entry.shortAnswerEn || entry.answerEn)) {
    return entry.shortAnswerEn || entry.answerEn || "";
  }

  if (language === "en") {
    const sanNicolasAnswer = buildSanNicolasEnglishAnswer(entry);

    if (sanNicolasAnswer) {
      return sanNicolasAnswer;
    }
  }

  const answer = entry.shortAnswer || entry.answer;

  if (language !== "en" || detectKnowledgeTextLanguage(`${entry.question} ${answer}`) === "en") {
    return answer;
  }

  return answer
    .replace(/\bDireccion:/gi, "Address:")
    .replace(/\bTelefono:/gi, "Phone:")
    .replace(/\bCorreo de atencion:/gi, "Citizen services email:")
    .replace(/\bCorreo judicial:/gi, "Legal email:")
    .replace(/\bCorreo de transito:/gi, "Transit email:")
    .replace(/\bCorreo de rentas:/gi, "Taxes email:")
    .replace(/\bCorreo de valorizacion:/gi, "Valuation email:")
    .replace(/\bLunes a jueves:/gi, "Monday to Thursday:")
    .replace(/\bViernes:/gi, "Friday:")
    .replace(/\bEl horario general de atencion es:/gi, "The general service hours are:")
    .replace(/\bHorario de atencion:/gi, "Opening hours:")
    .replace(/\bLa Alcaldia de Rionegro queda en el centro,?\s*en\b/gi, "Rionegro City Hall is located downtown, at")
    .replace(/\bLa Alcaldia de Rionegro\b/g, "Rionegro City Hall")
    .replace(/\bAlcaldia de Rionegro\b/g, "Rionegro City Hall")
    .replace(/\bAlcaldia\b/g, "City Hall")
    .replace(/\btramites\b/gi, "procedures")
    .replace(/\bimpuesto predial\b/gi, "property tax")
    .replace(/\btelefono\b/gi, "phone")
    .replace(/\bcorreo\b/gi, "email")
    .replace(/\bdireccion\b/gi, "address")
    .replace(/\bhorario\b/gi, "schedule");
}

export function validateEnglishKnowledgeAnswer(input: {
  query: string;
  answer: string;
  entry?: Pick<KnowledgeEntrySummary, "question" | "answer" | "category"> | null;
}) {
  const query = normalizeKnowledgeQuery(input.query);
  const answer = normalizeKnowledgeQuery(input.answer);
  const entryText = normalizeKnowledgeQuery(
    [input.entry?.question, input.entry?.answer, input.entry?.category].filter(Boolean).join(" "),
  );
  const asksWhere = /\bwhere\b|\baddress\b|\blocation\b/.test(query);
  const entryHasAddress = /\b(calle|cra|cr|carrera|avenida|av)\b/.test(entryText);
  const answerHasAddress = /\b(calle|cra|cr|carrera|avenida|av)\b/.test(answer);
  const isGeneric =
    /\bi found these official locations\b|\bofficial locations in rionegro\b/.test(answer);
  const mixesIrrelevantCards =
    /\btutucan\b/.test(answer) || /\balcaldia te escucha\b/.test(answer);
  const wrongLanguage =
    /\bqueda\b|\bdireccion\b|\btelefono\b|\bhorario\b/.test(answer) &&
    !/\baddress\b|\blocated\b|\bphone\b|\bschedule\b/.test(answer);

  return {
    ok:
      !isGeneric &&
      !mixesIrrelevantCards &&
      !wrongLanguage &&
      (!asksWhere || !entryHasAddress || answerHasAddress),
    isGeneric,
    mixesIrrelevantCards,
    wrongLanguage,
    missesAddress: asksWhere && entryHasAddress && !answerHasAddress,
  };
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
  const expandedQuery = expandKnowledgeQueryForSearch(query);
  const queryTokens = tokensFor(expandedQuery);

  if (!normalizedQuery || !entry.isActive) return 0;

  const normalizedQuestion = normalizeKnowledgeQuery(entry.question);
  const normalizedQuestionEn = normalizeKnowledgeQuery(entry.questionEn ?? "");
  const normalizedAliases = entry.aliases.map(normalizeKnowledgeQuery);
  const normalizedAliasesEn = (entry.aliasesEn ?? []).map(normalizeKnowledgeQuery);
  const normalizedTags = entry.tags.map(normalizeKnowledgeQuery);
  const normalizedTagsEn = (entry.tagsEn ?? []).map(normalizeKnowledgeQuery);
  let score = entry.confidence * 20;

  if (normalizedQuestion === normalizedQuery) score += 130;
  if (normalizedQuestionEn && normalizedQuestionEn === normalizedQuery) score += 130;
  if (
    normalizedAliases.some((alias) => alias === normalizedQuery) ||
    normalizedAliasesEn.some((alias) => alias === normalizedQuery)
  ) {
    score += 125;
  }

  if (normalizedQuestion.includes(normalizedQuery) || normalizedQuery.includes(normalizedQuestion)) {
    score += 80;
  }

  if (
    normalizedQuestionEn &&
    (normalizedQuestionEn.includes(normalizedQuery) || normalizedQuery.includes(normalizedQuestionEn))
  ) {
    score += 80;
  }

  if (
    [...normalizedAliases, ...normalizedAliasesEn].some(
      (alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias),
    )
  ) {
    score += 85;
  }

  score += tokenOverlapScore(queryTokens, entry.question, 18);
  score += tokenOverlapScore(queryTokens, entry.questionEn ?? "", 18);
  score += tokenOverlapScore(queryTokens, entry.aliases.join(" "), 20);
  score += tokenOverlapScore(queryTokens, (entry.aliasesEn ?? []).join(" "), 20);
  score += tokenOverlapScore(queryTokens, entry.tags.join(" "), 16);
  score += tokenOverlapScore(queryTokens, (entry.tagsEn ?? []).join(" "), 16);
  score += tokenOverlapScore(queryTokens, entry.category, 10);
  score += tokenOverlapScore(queryTokens, entry.intent ?? "", 8);
  score += tokenOverlapScore(queryTokens, entry.shortAnswer ?? "", 6);
  score += tokenOverlapScore(queryTokens, entry.shortAnswerEn ?? "", 6);
  score += tokenOverlapScore(queryTokens, entry.answer, 4);
  score += tokenOverlapScore(queryTokens, entry.answerEn ?? "", 4);

  if ([...normalizedTags, ...normalizedTagsEn].some((tag) => normalizedQuery.includes(tag))) {
    score += 16;
  }

  if (entry.isOfficial) score += 8;
  if (entry.needsReview) score -= 10;

  return Math.max(0, score);
}
