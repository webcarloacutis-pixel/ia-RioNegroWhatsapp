import {
  assistantNoDataMessage,
  assistantRules,
  assistantSampleQuestions,
  assistantScopeMessage,
  buildOfficialKnowledgeEntries,
  institutionalServices,
  municipalityContact,
  officialAnnouncementTranslations,
} from "@/lib/rionegro-content";
import { buildPlaceSearchText, officialPlaces, type OfficialPlace } from "@/lib/rionegro-places";
import type {
  AnnouncementSummary,
  AssistantChatResult,
  AssistantProfile,
  AssistantReplyMeta,
  AssistantRouteValue,
  AssistantSourceReference,
  AssistantTopicValue,
  KnowledgeEntrySummary,
} from "@/lib/types";
import { recordAssistantQuery } from "@/server/assistant-analytics-service";
import {
  addAssistantTurn,
  getAssistantSession,
  resetAssistantSession,
  type AssistantTurn,
  updateAssistantContext,
  updateAssistantProfile,
} from "@/server/assistant-session";
import { generateOpenAIText, getOpenAIModel, isOpenAIConfigured } from "@/server/openai-service";
import { listAnnouncements, listKnowledgeEntries } from "@/server/panel-service";

type Timeframe = "today" | "tomorrow" | "recent" | "none";
type AssistantLanguage = "es" | "en";

type ResolvedIntent = {
  topic: AssistantTopicValue;
  timeframe: Timeframe;
  language: AssistantLanguage;
  locationIntent: boolean;
  automotiveIntent: boolean;
  institutionalServicesIntent: boolean;
  tourismIntent: boolean;
  appointmentIntent: boolean;
  hoursIntent: boolean;
  assistantCapabilityIntent: boolean;
};

type QueryResolution = DraftReplyResult & {
  topic: AssistantTopicValue;
  timeframe: Timeframe;
  sources: AssistantSourceReference[];
  primaryPlace: string | null;
  suggestedItems: string[];
};

type RetrievalBundle = {
  announcements: AnnouncementSummary[];
  knowledgeEntries: KnowledgeEntrySummary[];
  placeMatches: OfficialPlace[];
  sources: AssistantSourceReference[];
};

type DraftReplyResult = {
  reply: string;
  route: AssistantRouteValue;
  usedOpenAI: boolean;
};

const STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "an",
  "and",
  "at",
  "can",
  "como",
  "con",
  "cual",
  "cuales",
  "cuanto",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "hay",
  "hello",
  "hi",
  "hoy",
  "i",
  "in",
  "is",
  "la",
  "las",
  "lo",
  "los",
  "mas",
  "me",
  "mi",
  "my",
  "of",
  "on",
  "please",
  "por",
  "que",
  "quiero",
  "se",
  "si",
  "su",
  "te",
  "the",
  "to",
  "un",
  "una",
  "what",
  "where",
  "who",
  "why",
  "y",
  "ya",
]);

const LEADING_CONVERSATIONAL_PREFIXES = [
  "y",
  "ademas",
  "además",
  "tambien",
  "también",
  "otra cosa",
  "por cierto",
  "and",
  "also",
  "another thing",
  "by the way",
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function stripLeadingConversationalPrefix(value: string) {
  let cleaned = value.trim();
  let changed = true;

  while (changed) {
    changed = false;

    for (const prefix of LEADING_CONVERSATIONAL_PREFIXES) {
      const pattern = new RegExp(`^${prefix.replace(/\s+/g, "\\s+")}\\s+`, "i");

      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, "").trim();
        changed = true;
      }
    }
  }

  return cleaned;
}

function getCopy(language: AssistantLanguage) {
  if (language === "en") {
    return {
      noData: "I do not have the exact detail right now, but I can still guide you.",
      scope: "I can only help with official information about the municipality of Rionegro.",
      greeting:
        "Hello, I am the official assistant of Rionegro. I can help you with places, events, procedures, news and municipal services. What would you like to know?",
      report:
        "You can report it through the official City Hall channels or the competent authorities. If you want, I can help you find the right office.",
      outOfScope:
        "I can help you with official information about Rionegro. If you want, ask me about places, procedures, schedules, news or municipal services.",
      alertsTitle: "Recent alerts in Rionegro:",
      alertsEmpty: "I do not have official alerts registered at the moment.",
      eventsTodayEmpty: "I do not have official events registered for today in Rionegro.",
      eventsTomorrowEmpty: "I do not have official events registered for tomorrow in Rionegro.",
      eventsEmpty: "I do not have official events registered at the moment.",
      eventsTodayTitle: "Today's events in Rionegro:",
      eventsTomorrowTitle: "Tomorrow's events in Rionegro:",
      eventsTitle: "Official events currently available:",
      newsTitle: "These are some of the latest news items from Rionegro:",
      newsEmpty: "I do not have official news loaded at the moment.",
      roadClosuresTitle: "Official road closure and mobility information:",
      roadClosuresEmpty: "I do not have official road closures registered at the moment.",
      publicWorksTitle: "Registered public works and infrastructure fronts:",
      publicWorksEmpty: "I do not have official active public works registered at the moment.",
      institutionalTitle: "Official information related to your request:",
      overviewTitle: "General update for Rionegro:",
      overviewAlerts: "Alerts",
      overviewEvents: "Events",
      overviewNews: "News",
      placeSinglePrefix: "Location",
      placeManyTitle: "I found these official locations in Rionegro:",
      placeReferenceLabel: "Reference area",
      multiIntentIntro: "Sure, I can help you with each point:",
      tourismTitle: "These are some places and plans of interest in Rionegro:",
      tourismEmpty:
        "I can suggest official places in Rionegro such as the main square, San Antonio de Pereira, Casa de la Convencion, Tutucan, San Nicolas and Llanogrande commercial areas.",
      appointmentReply:
        "I can help you identify the office you need, although this channel does not schedule appointments directly by WhatsApp.",
      appointmentPrompt:
        "If you tell me which office or procedure you need, I can guide you with the location, opening hours and the right office.",
      automotiveTitle:
        "If your car broke down, I can suggest these automotive points registered in Rionegro:",
      automotiveFallback:
        "If your car broke down, I can suggest registered automotive points in Rionegro such as Autolarte Rionegro, workshops in the Belchite sector, Quebrada Arriba and dealerships along the Llanogrande corridor.",
      servicesTitle:
        "At the Rionegro City Hall you can complete procedures and consultations related to:",
      servicesFooter:
        `The main headquarters is located at ${municipalityContact.address}. If you want, I can help you locate a specific office.`,
      hoursLabel: "Opening hours",
      hoursFallback:
        `The general institutional service hours are Monday to Thursday ${municipalityContact.schedule.mondayThursday}; Friday ${municipalityContact.schedule.friday}.`,
      capabilityReply:
        "I can help you with official information about Rionegro, such as locations, City Hall offices, mobility procedures, recent news, events, alerts and public services.",
      genericFallback:
        "I can help you better if you tell me whether you are looking for a place, a procedure, a schedule, news or something to do in Rionegro.",
      tourismFollowUp:
        "Would you like ideas for today, a family plan or something around Llanogrande?",
      placeFollowUp: "Do you want the location, opening hours or what you can do there?",
      servicesFollowUp: "If you want, tell me which office or procedure you need and I will narrow it down.",
      newsFollowUp: "If you want, I can also summarize the most relevant one.",
    };
  }

  return {
    noData: assistantNoDataMessage,
    scope: assistantScopeMessage,
    greeting:
      "Hola, soy el asistente oficial de Rionegro. Puedo ayudarte con lugares, eventos, tramites, noticias y servicios del municipio. ¿Que te gustaria saber?",
    report:
      "Puedes hacerlo por los canales oficiales de la Alcaldia o con la autoridad competente. Si quieres, te ayudo a ubicar la oficina adecuada.",
    outOfScope:
      "Puedo ayudarte con informacion oficial de Rionegro. Si quieres, preguntame por lugares, tramites, horarios, noticias o planes.",
    alertsTitle: "Alertas recientes en Rionegro:",
    alertsEmpty: "No tengo alertas oficiales registradas en este momento.",
    eventsTodayEmpty: "Por ahora no tengo eventos oficiales registrados para hoy en Rionegro.",
    eventsTomorrowEmpty: "Por ahora no tengo eventos oficiales registrados para manana en Rionegro.",
    eventsEmpty: "No tengo eventos oficiales registrados en este momento.",
    eventsTodayTitle: "Eventos de hoy en Rionegro:",
    eventsTomorrowTitle: "Eventos de manana en Rionegro:",
    eventsTitle: "Eventos oficiales disponibles:",
    newsTitle: "Estas son algunas de las noticias recientes de Rionegro:",
    newsEmpty: "No tengo noticias oficiales cargadas en este momento.",
    roadClosuresTitle: "Informacion oficial de cierres viales y movilidad:",
    roadClosuresEmpty: "No tengo cierres viales oficiales registrados en este momento.",
    publicWorksTitle: "Obras y frentes de infraestructura registrados:",
    publicWorksEmpty: "No tengo obras oficiales activas registradas en este momento.",
    institutionalTitle: "Informacion oficial relacionada con tu consulta:",
    overviewTitle: "Resumen general de Rionegro:",
    overviewAlerts: "Alertas",
    overviewEvents: "Eventos",
    overviewNews: "Noticias",
    placeSinglePrefix: "Ubicacion",
    placeManyTitle: "Encontre estas ubicaciones oficiales en Rionegro:",
    placeReferenceLabel: "Referencia",
    multiIntentIntro: "Claro, te ayudo con cada punto:",
    tourismTitle: "Estos son algunos lugares y planes de interes en Rionegro:",
    tourismEmpty:
      "Puedo sugerirte lugares oficiales de interes en Rionegro como el Parque Principal, San Antonio de Pereira, la Casa de la Convencion, Tutucan, San Nicolas y la zona de Llanogrande.",
    appointmentReply:
      "Puedo ayudarte a identificar la dependencia que necesitas, aunque por este canal no se agendan citas directamente por WhatsApp.",
    appointmentPrompt:
      "Si me dices para que dependencia o tramite necesitas la cita, te indico ubicacion, horario y la sede adecuada.",
    automotiveTitle:
      "Si tu carro se dano, puedo sugerirte estos puntos automotrices registrados en Rionegro:",
    automotiveFallback:
      "Puedo sugerirte puntos automotrices registrados en Rionegro como Autolarte Rionegro, talleres del sector Belchite, la zona de Quebrada Arriba y concesionarios de la via Llanogrande.",
    servicesTitle:
      "En la Alcaldia de Rionegro puedes realizar tramites y consultas relacionados con:",
    servicesFooter:
      `La sede principal esta en ${municipalityContact.address}. Si quieres, puedo ayudarte a ubicar una dependencia especifica.`,
    hoursLabel: "Horario de atencion",
    hoursFallback:
      `El horario institucional general es lunes a jueves ${municipalityContact.schedule.mondayThursday}; viernes ${municipalityContact.schedule.friday}.`,
    capabilityReply:
      "Puedo ayudarte con informacion oficial de Rionegro, como ubicaciones, dependencias de la Alcaldia, tramites de movilidad, noticias recientes, eventos, alertas y servicios institucionales.",
    genericFallback:
      "Si quieres, dime si buscas un lugar, un tramite, un horario, noticias o planes para hacer en Rionegro y te guio.",
    tourismFollowUp:
      "¿Quieres ideas para hoy, un plan en familia o algo por Llanogrande?",
    placeFollowUp: "¿Quieres la ubicacion, el horario o ideas de que hacer alli?",
    servicesFollowUp:
      "Si quieres, dime que dependencia o tramite necesitas y te lo aterrizo mejor.",
    newsFollowUp: "Si quieres, tambien te resumo la mas importante.",
  };
}

function formatDate(value: string, language: AssistantLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function getDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function getRelativeDateKey(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return getDateKey(now);
}

function scoreByTokens(text: string, tokens: string[]) {
  const normalized = normalizeText(text);
  let score = 0;

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += 10;
    }
  }

  return score;
}

function formatBulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatNumberedList(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n\n");
}

function detectLanguage(text: string, lastLanguage: AssistantLanguage): AssistantLanguage {
  if (!text) {
    return lastLanguage;
  }

  const normalized = normalizeText(text);
  let englishScore = 0;
  let spanishScore = 0;

  for (const hint of [
    "hello",
    "hi",
    "good morning",
    "good afternoon",
    "good evening",
    "where",
    "what",
    "who",
    "when",
    "how",
    "history",
    "museum",
    "location",
    "address",
    "latest",
    "news",
    "city hall",
    "please",
    "thanks",
  ]) {
    if (normalized.includes(hint)) {
      englishScore += hint.includes(" ") ? 2 : 1;
    }
  }

  for (const hint of [
    "hola",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "donde",
    "que",
    "cual",
    "quien",
    "como",
    "historia",
    "museo",
    "ubicacion",
    "direccion",
    "ultimas noticias",
    "noticias",
    "alcaldia",
    "gracias",
    "tramites",
    "horario",
  ]) {
    if (normalized.includes(hint)) {
      spanishScore += hint.includes(" ") ? 2 : 1;
    }
  }

  if (/[¿¡áéíóúñ]/i.test(text)) {
    spanishScore += 2;
  }

  if (includesAny(` ${normalized} `, [" the ", " and ", " from ", " latest ", " where "])) {
    englishScore += 2;
  }

  if (includesAny(` ${normalized} `, [" el ", " la ", " de ", " y ", " cual ", " donde ", " historia "])) {
    spanishScore += 2;
  }

  if (englishScore === 0 && spanishScore === 0) {
    return lastLanguage;
  }

  if (spanishScore > englishScore) {
    return "es";
  }

  if (englishScore > spanishScore) {
    return "en";
  }

  return lastLanguage;
}

function detectEntryLanguage(text: string): AssistantLanguage {
  const normalized = normalizeText(` ${text} `);

  if (
    includesAny(normalized, [
      " what ",
      " where ",
      " who ",
      " why ",
      " municipality ",
      " city hall ",
      " official assistant ",
      " monday to thursday ",
    ])
  ) {
    return "en";
  }

  return "es";
}

function finalizeReply(reply: string, language: AssistantLanguage) {
  const trimmed = reply.trim();
  const copy = getCopy(language);

  if (!trimmed) {
    return copy.genericFallback;
  }

  return trimmed;
}

function isGreeting(text: string) {
  const normalized = normalizeText(text);

  if (
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello|hi|good morning|good afternoon|good evening)\b/.test(
      normalized,
    )
  ) {
    const remainder = normalized.replace(
      /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello|hi|good morning|good afternoon|good evening)\b/,
      "",
    ).trim();

    return !remainder;
  }

  return false;
}

function isShortFollowUp(text: string) {
  return (
    text.split(/\s+/).length <= 6 &&
    includesAny(text, [
      "y ",
      "manana",
      "hoy",
      "despues",
      "entonces",
      "and ",
      "tomorrow",
      "today",
      "then",
      "after",
      "also",
      "ademas",
      "tambien",
    ])
  );
}

function hasLocationIntent(text: string) {
  return includesAny(text, [
    "donde",
    "direccion",
    "ubicacion",
    "queda",
    "como llego",
    "como llegar",
    "where",
    "address",
    "location",
    "located",
    "directions",
    "how do i get",
    "how to get",
  ]);
}

function hasTourismIntent(text: string) {
  return includesAny(text, [
    "que hay para hacer",
    "que hacer",
    "que puedo hacer",
    "que hacer hoy",
    "que hacer este fin de semana",
    "planes",
    "planes en rionegro",
    "plan para hoy",
    "actividades hoy",
    "que lugares hay",
    "lugares hay de interes",
    "lugares de interes",
    "lugar de interes",
    "lugares para visitar",
    "sitios turisticos",
    "sitios de interes",
    "turismo",
    "visitar",
    "conocer",
    "what to do",
    "what can i do",
    "places of interest",
    "tourism",
    "what to visit",
    "interesting places",
  ]);
}

function hasAutomotiveIntent(text: string) {
  return includesAny(text, [
    "carro",
    "auto",
    "vehiculo",
    "taller",
    "mecanico",
    "mecanica",
    "arreglar",
    "reparacion",
    "repuesto",
    "concesionario",
    "car repair",
    "mechanic",
    "dealership",
    "spare parts",
    "vehicle",
    "broke down",
  ]);
}

function hasAppointmentIntent(text: string) {
  return includesAny(text, [
    "cita",
    "citas",
    "agendar",
    "agendar cita",
    "agendar una cita",
    "sacar cita",
    "appointment",
    "appointments",
    "schedule appointment",
    "book appointment",
  ]);
}

function hasInstitutionalServicesIntent(text: string) {
  return includesAny(text, [
    "tramites",
    "tramite",
    "servicios",
    "puedo realizar",
    "atencion al ciudadano",
    "pqrs",
    "impuestos",
    "catastro",
    "planeacion",
    "licencia",
    "licencia de conduccion",
    "pase",
    "comparendo",
    "pagar comparendo",
    "conduccion",
    "movilidad",
    "transito",
    "empleo",
    "salud",
    "educacion",
    "procedures",
    "procedure",
    "services",
    "citizen services",
    "taxes",
    "cadastre",
    "license",
    "driver license",
    "traffic ticket",
    "ticket payment",
    "mobility",
    "transit",
    "planning",
    "employment",
    "education",
    "health",
  ]);
}

function hasHoursIntent(text: string) {
  return includesAny(text, [
    "horario",
    "horarios",
    "atienden",
    "a que hora",
    "abre",
    "opening hours",
    "hours",
    "schedule",
    "what time",
    "when is it open",
  ]);
}

function hasAssistantCapabilityIntent(text: string) {
  return includesAny(text, [
    "que haces",
    "en que ayudas",
    "en que me puedes ayudar",
    "que puedes hacer",
    "what do you do",
    "how can you help",
    "what can you do",
  ]);
}

function detectTimeframe(text: string, lastTimeframe: Timeframe): Timeframe {
  if (includesAny(text, ["hoy", "today"])) return "today";
  if (includesAny(text, ["manana", "tomorrow"])) return "tomorrow";
  if (
    includesAny(text, [
      "reciente",
      "recientes",
      "ultimo",
      "ultimos",
      "ultimas",
      "actualmente",
      "ahora",
      "recent",
      "latest",
      "currently",
      "right now",
    ])
  ) {
    return "recent";
  }

  return isShortFollowUp(text) ? lastTimeframe : "none";
}

function detectTopic(text: string, lastTopic: AssistantTopicValue | null): AssistantTopicValue {
  if (!text || isGreeting(text)) {
    return "GREETING";
  }

  if (
    includesAny(text, [
      "html",
      "css",
      "javascript",
      "python",
      "sql",
      "traduce",
      "translate this",
      "resume este texto",
      "summarize this text",
      "hazme una pagina",
      "build me a page",
      "capital de",
      "capital of",
      "receta",
      "recipe",
    ])
  ) {
    return "OUT_OF_SCOPE";
  }

  if (hasAssistantCapabilityIntent(text)) {
    return "FAQ";
  }

  if (hasTourismIntent(text)) {
    return "EVENTS";
  }

  if (includesAny(text, ["denunciar", "denuncia", "report", "complaint"])) {
    return "DENUNCIAS";
  }

  if (
    includesAny(text, [
      "que esta pasando en rionegro",
      "que esta pasando",
      "que pasa en rionegro",
      "que esta ocurriendo",
      "resumen general",
      "what is happening in rionegro",
      "what's happening in rionegro",
      "general summary",
      "general update",
    ])
  ) {
    return "OVERVIEW";
  }

  if (
    includesAny(text, [
      "cierre vial",
      "cierres viales",
      "movilidad",
      "transito",
      "vias",
      "via",
      "road closure",
      "road closures",
      "traffic",
      "transit",
      "street closure",
      "roads",
    ])
  ) {
    return "ROAD_CLOSURES";
  }

  if (
    includesAny(text, [
      "obra",
      "obras",
      "infraestructura",
      "mantenimiento vial",
      "alumbrado",
      "public works",
      "infrastructure",
      "road work",
      "lighting",
    ])
  ) {
    return "PUBLIC_WORKS";
  }

  if (
    includesAny(text, [
      "alerta",
      "alertas",
      "seguridad",
      "emergencia",
      "urgente",
      "clima",
      "lluvia",
      "alert",
      "alerts",
      "safety",
      "emergency",
      "urgent",
      "weather",
      "rain",
    ])
  ) {
    return "ALERTS";
  }

  if (
    includesAny(text, [
      "evento",
      "eventos",
      "actividad",
      "actividades",
      "agenda",
      "que hay",
      "que hacer",
      "hoy en rionegro",
      "manana en rionegro",
      "event",
      "events",
      "activity",
      "activities",
      "what to do",
      "today in rionegro",
      "tomorrow in rionegro",
    ])
  ) {
    return "EVENTS";
  }

  if (includesAny(text, ["noticia", "noticias", "boletin", "latest news", "news", "bulletin"])) {
    return "NEWS";
  }

  if (
    hasLocationIntent(text) ||
    hasAutomotiveIntent(text) ||
    hasInstitutionalServicesIntent(text) ||
    hasHoursIntent(text) ||
    includesAny(text, [
      "alcalde",
      "alcaldia",
      "secretaria",
      "secretarias",
      "programa",
      "programas",
      "telefono",
      "correo",
      "direccion",
      "contacto",
      "horario",
      "nit",
      "codigo postal",
      "que es rionegro",
      "donde queda rionegro",
      "historia de rionegro",
      "historia",
      "aeropuerto",
      "rionegro",
      "municipio",
      "que hace la alcaldia",
      "mayor",
      "city hall",
      "secretariat",
      "program",
      "programs",
      "phone",
      "email",
      "address",
      "contact",
      "schedule",
      "postal code",
      "zip code",
      "history of rionegro",
      "history",
      "history museum",
      "municipality",
    ])
  ) {
    return "INSTITUTIONAL";
  }

  if (includesAny(text, ["pregunta frecuente", "faq", "frequently asked", "common question"])) {
    return "FAQ";
  }

  if (lastTopic && isShortFollowUp(text)) {
    return lastTopic;
  }

  return "UNKNOWN";
}

function exactKnowledgeAnswer(
  text: string,
  language: AssistantLanguage,
  knowledgeEntries: KnowledgeEntrySummary[],
) {
  const sameLanguage = knowledgeEntries.filter((entry) => detectEntryLanguage(entry.question) === language);

  return (
    sameLanguage.find((entry) => normalizeText(entry.question) === text) ??
    knowledgeEntries.find((entry) => normalizeText(entry.question) === text) ??
    null
  );
}

function mergeKnowledgeEntries(knowledgeEntries: KnowledgeEntrySummary[]) {
  const merged = new Map<string, KnowledgeEntrySummary>();

  for (const entry of knowledgeEntries) {
    merged.set(normalizeText(entry.question), entry);
  }

  for (const [index, entry] of buildOfficialKnowledgeEntries().entries()) {
    const key = normalizeText(entry.question);

    if (!merged.has(key)) {
      merged.set(key, {
        id: `official-${index}`,
        question: entry.question,
        answer: entry.answer,
        category: entry.category,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      });
    }
  }

  return Array.from(merged.values());
}

function searchKnowledgeEntries(
  message: string,
  topic: AssistantTopicValue,
  language: AssistantLanguage,
  knowledgeEntries: KnowledgeEntrySummary[],
) {
  const tokens = tokenize(message);
  const rankedEntries = knowledgeEntries
    .map((entry) => {
      const categoryBonus =
        topic === "INSTITUTIONAL" || topic === "FAQ"
          ? scoreByTokens(entry.category, tokens)
          : 0;
      const languageBonus = detectEntryLanguage(entry.question) === language ? 25 : 0;

      const score =
        scoreByTokens(entry.question, tokens) * 3 +
        scoreByTokens(entry.answer, tokens) +
        categoryBonus +
        languageBonus;

      return {
        entry,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const sameLanguageEntries = rankedEntries.filter(
    (item) => detectEntryLanguage(item.entry.question) === language,
  );

  if (sameLanguageEntries.length) {
    return sameLanguageEntries.slice(0, 4).map((item) => item.entry);
  }

  return rankedEntries.slice(0, 4).map((item) => item.entry);
}

function searchPlaces(message: string) {
  const tokens = tokenize(message);
  const normalizedMessage = normalizeText(message);
  const rankedPlaces = officialPlaces
    .map((place) => {
      const corpus = normalizeText(buildPlaceSearchText(place));
      let score = scoreByTokens(corpus, tokens);

      if (normalizedMessage.length >= 4 && corpus.includes(normalizedMessage)) {
        score += 30;
      }

      if (normalizedMessage.includes(normalizeText(place.name))) {
        score += 40;
      }

      for (const alias of place.aliases ?? []) {
        const normalizedAlias = normalizeText(alias);
        if (normalizedAlias && normalizedMessage.includes(normalizedAlias)) {
          score += 25;
        }
      }

      return {
        place,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const bestScore = rankedPlaces[0]?.score ?? 0;
  const minimumScore =
    bestScore >= 55 ? Math.max(30, bestScore - 8) : Math.max(15, bestScore - 20);

  return rankedPlaces
    .filter((item) => item.score >= minimumScore)
    .slice(0, 3)
    .map((item) => item.place);
}

function searchAutomotivePlaces(message: string) {
  const tokens = tokenize(message);
  const automotivePlaces = officialPlaces.filter(
    (place) =>
      ["automotive_service", "car_repair", "dealership", "mechanic_zone"].includes(
        normalizeText(place.category),
      ) ||
      (place.tags ?? []).some((tag) =>
        includesAny(normalizeText(tag), ["automotive", "car_repair", "dealership", "mechanic"]),
      ),
  );

  const rankedPlaces = automotivePlaces
    .map((place) => ({
      place,
      score: scoreByTokens(buildPlaceSearchText(place), tokens) + 10,
    }))
    .sort((left, right) => right.score - left.score);

  if (rankedPlaces.some((item) => item.score > 0)) {
    return rankedPlaces.filter((item) => item.score > 0).slice(0, 4).map((item) => item.place);
  }

  return automotivePlaces.slice(0, 4);
}

function searchTourismPlaces(message: string) {
  const tokens = tokenize(message);
  const tourismPlaces = officialPlaces.filter((place) =>
    ["turismo", "deporte", "comercio", "cultura"].includes(normalizeText(place.category)),
  );
  const prioritizedPlaces = tourismPlaces
    .slice()
    .sort((left, right) => {
      const leftPriority = normalizeText(left.category) === "turismo" ? 0 : 1;
      const rightPriority = normalizeText(right.category) === "turismo" ? 0 : 1;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.name.localeCompare(right.name);
    });

  const ranked = prioritizedPlaces
    .map((place) => ({
      place,
      score: scoreByTokens(buildPlaceSearchText(place), tokens),
    }))
    .sort((left, right) => right.score - left.score);

  const positiveMatches = ranked.filter((item) => item.score > 0).slice(0, 6).map((item) => item.place);

  if (positiveMatches.length) {
    return positiveMatches;
  }

  return prioritizedPlaces.slice(0, 6);
}

function shouldUseLastPlaceReference(text: string) {
  return includesAny(text, [
    "alli",
    "ahi",
    "ese lugar",
    "ese sitio",
    "ese punto",
    "ese centro",
    "alla",
    "there",
    "that place",
    "that spot",
  ]);
}

function describePlaceExperience(place: OfficialPlace, language: AssistantLanguage) {
  const category = normalizeText(place.category);

  if (language === "en") {
    if (category === "comercio") {
      return `At ${place.name} you can usually find restaurants, cafes, shops and a relaxed plan to walk around or spend the afternoon.`;
    }

    if (category === "turismo") {
      return `${place.name} is a good option to walk around, get to know the area and enjoy a representative place in Rionegro.`;
    }

    if (category === "deporte") {
      return `${place.name} is a good option if you are looking for sports, recreation or outdoor activity.`;
    }

    return `${place.name} is a useful place to visit depending on the kind of plan you want in Rionegro.`;
  }

  if (category === "comercio") {
    return `En ${place.name} normalmente puedes encontrar restaurantes, cafes, tiendas y un plan tranquilo para caminar o pasar la tarde.`;
  }

  if (category === "turismo") {
    return `${place.name} es una buena opcion para caminar, conocer la zona y disfrutar un lugar representativo de Rionegro.`;
  }

  if (category === "deporte") {
    return `${place.name} es buena opcion si buscas deporte, recreacion o actividad al aire libre.`;
  }

  return `${place.name} puede ser una buena opcion segun el tipo de plan que quieras hacer en Rionegro.`;
}

function buildConversationalFallback(
  intent: ResolvedIntent,
  retrieval: RetrievalBundle,
  language: AssistantLanguage,
) {
  const copy = getCopy(language);

  if (intent.appointmentIntent) {
    return `${copy.appointmentReply}\n\n${copy.appointmentPrompt}`;
  }

  if (intent.tourismIntent) {
    return `${copy.tourismEmpty}\n\n${copy.tourismFollowUp}`;
  }

  if (intent.institutionalServicesIntent) {
    return `${copy.noData}\n\n${copy.servicesFollowUp}`;
  }

  if (intent.locationIntent && retrieval.placeMatches.length) {
    return `${buildPlaceReply(retrieval.placeMatches, language)}\n\n${copy.placeFollowUp}`;
  }

  return copy.genericFallback;
}

function searchAnnouncements(
  message: string,
  topic: AssistantTopicValue,
  timeframe: Timeframe,
  announcements: AnnouncementSummary[],
  profile: AssistantProfile,
) {
  const tokens = tokenize(message);
  const zone = normalizeText(profile.zone ?? "");

  const filteredByTopic = announcements.filter((item) => {
    if (topic === "EVENTS") return item.type === "EVENT";
    if (topic === "NEWS") return item.type === "NEWS";
    if (topic === "ALERTS") return item.type === "ALERT" || item.type === "ROAD_CLOSURE";
    if (topic === "ROAD_CLOSURES") {
      return (
        item.type === "ROAD_CLOSURE" ||
        normalizeText(`${item.title} ${item.message}`).includes("cierre") ||
        normalizeText(`${item.title} ${item.message}`).includes("movilidad")
      );
    }
    if (topic === "PUBLIC_WORKS") {
      return (
        item.type === "PUBLIC_WORK" ||
        normalizeText(`${item.title} ${item.message}`).includes("obra") ||
        normalizeText(`${item.title} ${item.message}`).includes("infraestructura")
      );
    }

    return ["ALERT", "NEWS", "EVENT", "ROAD_CLOSURE", "PUBLIC_WORK"].includes(item.type);
  });

  const dateFiltered = filteredByTopic.filter((item) => {
    if (timeframe === "today") return getDateKey(item.scheduledAt) === getRelativeDateKey(0);
    if (timeframe === "tomorrow") return getDateKey(item.scheduledAt) === getRelativeDateKey(1);
    return true;
  });

  return dateFiltered
    .map((item) => {
      const corpus = `${item.title} ${item.message} ${item.location ?? ""} ${item.segment?.name ?? ""}`;
      let score = scoreByTokens(corpus, tokens);

      if (!tokens.length) {
        score += 6;
      }

      if (zone && normalizeText(corpus).includes(zone)) {
        score += 12;
      }

      if (timeframe === "recent") {
        score += 6;
      }

      return {
        item,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.item.scheduledAt).getTime() - new Date(left.item.scheduledAt).getTime();
    })
    .map((item) => item.item);
}

function getLatestAnnouncements(
  announcements: AnnouncementSummary[],
  type: AnnouncementSummary["type"],
  limit: number,
) {
  return announcements
    .filter((item) => item.type === type)
    .sort(
      (left, right) =>
        new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime(),
    )
    .slice(0, limit);
}

function localizeAnnouncement(item: AnnouncementSummary, language: AssistantLanguage) {
  if (language !== "en") {
    return item;
  }

  const translation =
    officialAnnouncementTranslations[
      item.title as keyof typeof officialAnnouncementTranslations
    ];

  if (!translation) {
    return item;
  }

  return {
    ...item,
    title: translation.titleEn,
    message: translation.messageEn,
  };
}

function buildSourceRefs(
  knowledgeEntries: KnowledgeEntrySummary[],
  announcements: AnnouncementSummary[],
  placeMatches: OfficialPlace[],
) {
  return [
    ...knowledgeEntries.slice(0, 2).map((entry) => ({
      type: "knowledge" as const,
      title: entry.question,
    })),
    ...placeMatches.slice(0, 2).map((place) => ({
      type: "knowledge" as const,
      title: `Ubicacion: ${place.name}`,
    })),
    ...announcements.slice(0, 3).map((item) => ({
      type: "announcement" as const,
      title: item.title,
    })),
  ];
}

function buildPlaceReply(placeMatches: OfficialPlace[], language: AssistantLanguage) {
  const copy = getCopy(language);

  if (!placeMatches.length) {
    return copy.genericFallback;
  }

  const formatPlaceDetails = (place: OfficialPlace) => {
    const parts = [`${place.address}.`];

    if (place.area) {
      parts.push(`${copy.placeReferenceLabel}: ${place.area}.`);
    }

    return parts.join(" ");
  };

  const formatPlace = (place: OfficialPlace) => `${place.name}: ${formatPlaceDetails(place)}`;

  if (placeMatches.length === 1) {
    return [
      language === "en"
        ? `${placeMatches[0].name} is at ${formatPlaceDetails(placeMatches[0])}`
        : `${placeMatches[0].name} queda en ${formatPlaceDetails(placeMatches[0])}`,
      copy.placeFollowUp,
    ].join("\n\n");
  }

  return [copy.placeManyTitle, formatBulletList(placeMatches.map(formatPlace))].join("\n\n");
}

function buildHoursReply(placeMatches: OfficialPlace[], language: AssistantLanguage) {
  const copy = getCopy(language);
  const match = placeMatches[0];

  if (!match) {
    return copy.hoursFallback;
  }

  const placeHours = language === "en" ? match.openingHoursEn : match.openingHoursEs;

  if (!placeHours) {
    return language === "en"
      ? `${match.name} is located at ${match.address}${match.area ? `, ${match.area}` : ""}. ${copy.hoursFallback}`
      : `${match.name} se encuentra en ${match.address}${match.area ? `, ${match.area}` : ""}. ${copy.hoursFallback}`;
  }

  return language === "en"
    ? `${match.name} is located at ${match.address}${match.area ? `, ${match.area}` : ""}. ${copy.hoursLabel}: ${placeHours}`
    : `${match.name} se encuentra en ${match.address}${match.area ? `, ${match.area}` : ""}. ${copy.hoursLabel}: ${placeHours}`;
}

function buildAutomotiveReply(message: string, language: AssistantLanguage) {
  const copy = getCopy(language);
  const matches = searchAutomotivePlaces(message);

  if (!matches.length) {
    return copy.automotiveFallback;
  }

  return [
    copy.automotiveTitle,
    formatBulletList(
      matches.map(
        (place) => `${place.name}: ${place.address}${place.area ? ` (${place.area})` : ""}.`,
      ),
    ),
    language === "en"
      ? "If you want, tell me what kind of repair you need and I will narrow it down."
      : "Si quieres, dime que tipo de reparacion necesitas y te lo aterrizo mejor.",
  ].join("\n\n");
}

function buildTourismReply(
  announcements: AnnouncementSummary[],
  placeMatches: OfficialPlace[],
  timeframe: Timeframe,
  language: AssistantLanguage,
) {
  const copy = getCopy(language);
  const tourismPlaces = placeMatches.length ? placeMatches : searchTourismPlaces("");
  const focusedPlace = placeMatches[0] ?? null;
  const events = announcements
    .filter((item) => item.type === "EVENT")
    .slice(0, timeframe === "today" || timeframe === "tomorrow" ? 2 : 1);

  if (focusedPlace) {
    return [
      describePlaceExperience(focusedPlace, language),
      copy.placeFollowUp,
    ].join("\n\n");
  }

  const parts = [copy.tourismTitle];

  if (events.length) {
    parts.push(
      language === "en"
        ? `Plans available ${timeframe === "today" ? "for today" : timeframe === "tomorrow" ? "for tomorrow" : "right now"}:\n${formatBulletList(
            events.map(
              (item) =>
                `${item.title} | ${formatDate(item.scheduledAt, language)}${item.location ? ` | ${item.location}` : ""}. ${item.message}`,
            ),
          )}`
        : `Planes disponibles ${timeframe === "today" ? "para hoy" : timeframe === "tomorrow" ? "para manana" : "en este momento"}:\n${formatBulletList(
            events.map(
              (item) =>
                `${item.title} | ${formatDate(item.scheduledAt, language)}${item.location ? ` | ${item.location}` : ""}. ${item.message}`,
            ),
          )}`,
    );
  }

  if (tourismPlaces.length) {
    parts.push(
      language === "en"
        ? `Places you can visit:\n${formatBulletList(
            tourismPlaces.slice(0, 3).map((place) => `${place.name}: ${place.address}${place.area ? ` (${place.area})` : ""}.`),
          )}`
        : `Lugares que puedes visitar:\n${formatBulletList(
            tourismPlaces.slice(0, 3).map((place) => `${place.name}: ${place.address}${place.area ? ` (${place.area})` : ""}.`),
          )}`,
    );
  }

  if (parts.length === 1) {
    parts.push(copy.tourismEmpty);
  }

  parts.push(copy.tourismFollowUp);

  return parts.join("\n\n");
}

function buildInstitutionalServicesReply(message: string, language: AssistantLanguage) {
  const copy = getCopy(language);
  const normalizedMessage = normalizeText(message);
  const mobilityFocused = includesAny(normalizedMessage, [
    "licencia",
    "licencia de conduccion",
    "pase",
    "comparendo",
    "pagar comparendo",
    "movilidad",
    "transito",
    "license",
    "driver license",
    "traffic ticket",
    "ticket payment",
    "mobility",
    "transit",
  ]);
  const matchedServices = institutionalServices.filter((service) =>
    service.aliases.some((alias) => normalizedMessage.includes(normalizeText(alias))),
  );
  const servicesToShow = (matchedServices.length ? matchedServices : institutionalServices).slice(0, 6);

  if (mobilityFocused) {
    return language === "en"
      ? [
          "For mobility procedures in Rionegro, you can go to SOMOS (Mobility and Transit), located at Carrera 48 # 47-19.",
          "There you can ask about driver licenses, traffic tickets, payments and related procedures.",
          "If you want, I can also give you the opening hours.",
        ].join("\n\n")
      : [
          "Para tramites de movilidad en Rionegro puedes dirigirte a SOMOS (Movilidad y Transito), ubicado en Carrera 48 # 47-19.",
          "Alla puedes consultar licencia de conduccion, comparendos, pagos y tramites relacionados.",
          "Si quieres, tambien te doy el horario.",
        ].join("\n\n");
  }

  return [
    copy.servicesTitle,
    formatBulletList(
      servicesToShow.map((service) =>
        language === "en"
          ? `${service.titleEn}: ${service.descriptionEn}`
          : `${service.titleEs}: ${service.descriptionEs}`,
      ),
    ),
    copy.servicesFollowUp,
  ].join("\n\n");
}

function buildAppointmentReply(message: string, placeMatches: OfficialPlace[], language: AssistantLanguage) {
  const copy = getCopy(language);
  const normalized = normalizeText(message);
  const mobilityMatch =
    placeMatches.find((place) => normalizeText(place.name).includes("movilidad")) ??
    officialPlaces.find((place) => normalizeText(place.name).includes("movilidad"));

  if (
    includesAny(normalized, [
      "movilidad",
      "transito",
      "licencia",
      "comparendo",
      "pase",
      "mobility",
      "transit",
      "license",
      "traffic ticket",
    ]) &&
    mobilityMatch
  ) {
    return language === "en"
      ? [
          copy.appointmentReply,
          `${mobilityMatch.name} is located at ${mobilityMatch.address}${mobilityMatch.area ? ` (${mobilityMatch.area})` : ""}.`,
          `${copy.hoursLabel}: ${mobilityMatch.openingHoursEn ?? getCopy("en").hoursFallback}`,
        ].join("\n\n")
      : [
          copy.appointmentReply,
          `${mobilityMatch.name} esta ubicado en ${mobilityMatch.address}${mobilityMatch.area ? ` (${mobilityMatch.area})` : ""}.`,
          `${copy.hoursLabel}: ${mobilityMatch.openingHoursEs ?? getCopy("es").hoursFallback}`,
        ].join("\n\n");
  }

  return language === "en"
    ? [
        copy.appointmentReply,
        copy.appointmentPrompt,
        "For example, I can guide you with Mobility, Treasury, Planning or Citizen Services.",
      ].join("\n\n")
    : [
        copy.appointmentReply,
        copy.appointmentPrompt,
        "Por ejemplo, puedo orientarte con Movilidad, Hacienda, Planeacion o Atencion al Ciudadano.",
      ].join("\n\n");
}

function buildAlertsReply(announcements: AnnouncementSummary[], language: AssistantLanguage) {
  const copy = getCopy(language);

  if (!announcements.length) {
    return copy.alertsEmpty;
  }

  return [
    copy.alertsTitle,
    formatBulletList(
      announcements.slice(0, 3).map((item) => {
        const place = item.location ? ` | ${item.location}` : "";
        return `${item.title} | ${formatDate(item.scheduledAt, language)}${place}. ${item.message}`;
      }),
    ),
  ].join("\n\n");
}

function buildEventsReply(
  announcements: AnnouncementSummary[],
  timeframe: Timeframe,
  language: AssistantLanguage,
) {
  const copy = getCopy(language);

  if (!announcements.length) {
    if (timeframe === "today") {
      return `${copy.eventsTodayEmpty}\n\n${copy.tourismFollowUp}`;
    }

    if (timeframe === "tomorrow") {
      return `${copy.eventsTomorrowEmpty}\n\n${copy.tourismFollowUp}`;
    }

    return `${copy.eventsEmpty}\n\n${copy.tourismFollowUp}`;
  }

  const title =
    timeframe === "today"
      ? copy.eventsTodayTitle
      : timeframe === "tomorrow"
        ? copy.eventsTomorrowTitle
        : copy.eventsTitle;

  return [
    title,
    formatBulletList(
      announcements.slice(0, 3).map((item) => {
        const place = item.location ? ` | ${item.location}` : "";
        return `${item.title} | ${formatDate(item.scheduledAt, language)}${place}. ${item.message}`;
      }),
    ),
    copy.tourismFollowUp,
  ].join("\n\n");
}

function buildNewsReply(announcements: AnnouncementSummary[], language: AssistantLanguage) {
  const copy = getCopy(language);
  const latestNews = getLatestAnnouncements(announcements, "NEWS", 4).map((item) =>
    localizeAnnouncement(item, language),
  );

  if (!latestNews.length) {
    return copy.newsEmpty;
  }

  return [
    copy.newsTitle,
    formatBulletList(
      latestNews.slice(0, 3).map(
        (item) => `${item.title} | ${formatDate(item.scheduledAt, language)}. ${item.message}`,
      ),
    ),
    copy.newsFollowUp,
  ].join("\n\n");
}

function buildRoadClosuresReply(announcements: AnnouncementSummary[], language: AssistantLanguage) {
  const copy = getCopy(language);

  if (!announcements.length) {
    return `${copy.roadClosuresEmpty} ${copy.noData}`;
  }

  return [
    copy.roadClosuresTitle,
    formatBulletList(
      announcements.slice(0, 3).map((item) => {
        const place = item.location ? ` | ${item.location}` : "";
        return `${item.title}${place}. ${item.message}`;
      }),
    ),
  ].join("\n\n");
}

function buildPublicWorksReply(announcements: AnnouncementSummary[], language: AssistantLanguage) {
  const copy = getCopy(language);

  if (!announcements.length) {
    return `${copy.publicWorksEmpty} ${copy.noData}`;
  }

  return [
    copy.publicWorksTitle,
    formatBulletList(announcements.slice(0, 3).map((item) => `${item.title}. ${item.message}`)),
  ].join("\n\n");
}

function buildInstitutionalReply(
  knowledgeEntries: KnowledgeEntrySummary[],
  placeMatches: OfficialPlace[],
  language: AssistantLanguage,
) {
  const copy = getCopy(language);

  if (placeMatches.length) {
    return buildPlaceReply(placeMatches, language);
  }

  if (!knowledgeEntries.length) {
    return copy.servicesFollowUp;
  }

  if (knowledgeEntries.length === 1) {
    return `${knowledgeEntries[0].answer}\n\n${copy.servicesFollowUp}`;
  }

  return [
    copy.institutionalTitle,
    formatBulletList(knowledgeEntries.slice(0, 2).map((entry) => entry.answer)),
    copy.servicesFollowUp,
  ].join("\n\n");
}

function buildOverviewReply(announcements: AnnouncementSummary[], language: AssistantLanguage) {
  const copy = getCopy(language);
  const alerts = announcements.filter((item) => item.type === "ALERT").slice(0, 2);
  const events = announcements.filter((item) => item.type === "EVENT").slice(0, 2);
  const news = announcements.filter((item) => item.type === "NEWS").slice(0, 2);

  const parts: string[] = [copy.overviewTitle];

  if (alerts.length) {
    parts.push(`${copy.overviewAlerts}: ${alerts.map((item) => item.title).join("; ")}.`);
  }

  if (events.length) {
    parts.push(
      `${copy.overviewEvents}: ${events
        .map((item) => `${item.title} (${formatDate(item.scheduledAt, language)})`)
        .join("; ")}.`,
    );
  }

  if (news.length) {
    parts.push(`${copy.overviewNews}: ${news.map((item) => item.title).join("; ")}.`);
  }

  if (parts.length === 1) {
    parts.push(copy.genericFallback);
  }

  return parts.join("\n\n");
}

async function composeHybridReply(input: {
  message: string;
  intent: ResolvedIntent;
  profile: AssistantProfile;
  retrieval: RetrievalBundle;
}) {
  const aiText = await generateOpenAIText({
    systemPrompt: [
      "Eres el asistente oficial de la Alcaldia de Rionegro.",
      "Responde solo con la informacion contenida en el contexto oficial proporcionado.",
      "No inventes datos, no respondas temas ajenos a Rionegro, no des opiniones politicas y no actues como una IA generalista.",
      "El tono debe ser cercano, claro, breve y util.",
      "Prioriza utilidad inmediata y respuestas cortas por defecto.",
      "No uses frases tecnicas ni menciones modelos, motores, OpenAI o detalles internos.",
      "Si falta un dato exacto, ayuda con orientacion parcial o una pregunta aclaratoria corta.",
      "Mantiene continuidad conversacional cuando el mensaje parezca seguir una idea anterior.",
      `Responde en ${input.intent.language === "en" ? "ingles" : "espanol"}.`,
      "No mezcles idiomas en la respuesta.",
    ].join("\n"),
    userPrompt: [
      `Consulta ciudadana: ${input.message}`,
      `Idioma detectado: ${input.intent.language}`,
      `Tema detectado: ${input.intent.topic}`,
      `Marco temporal: ${input.intent.timeframe}`,
      `Consulta de ubicacion: ${input.intent.locationIntent ? "si" : "no"}`,
      `Consulta automotriz: ${input.intent.automotiveIntent ? "si" : "no"}`,
      `Consulta de tramites: ${input.intent.institutionalServicesIntent ? "si" : "no"}`,
      `Consulta de horario: ${input.intent.hoursIntent ? "si" : "no"}`,
      `Zona del ciudadano: ${input.profile.zone ?? "No indicada"}`,
      `Tipo de usuario: ${input.profile.userType ?? "No indicado"}`,
      "Contexto oficial:",
      JSON.stringify(
        {
          knowledgeEntries: input.retrieval.knowledgeEntries.map((entry) => ({
            question: entry.question,
            answer: entry.answer,
            category: entry.category,
          })),
          announcements: input.retrieval.announcements.map((item) => ({
            title: item.title,
            message: item.message,
            location: item.location,
            type: item.type,
            scheduledAt: item.scheduledAt,
            segment: item.segment?.name ?? null,
          })),
          places: input.retrieval.placeMatches.map((place) => ({
            name: place.name,
            category: place.category,
            address: place.address,
            area: place.area ?? null,
            openingHoursEs: place.openingHoursEs ?? null,
            openingHoursEn: place.openingHoursEn ?? null,
          })),
        },
        null,
        2,
      ),
      "Redacta la mejor respuesta posible solo con ese contexto.",
      "Si el usuario pide planes, actividades o lugares para visitar, prioriza sugerencias utiles y concretas.",
      "Si el usuario pregunta por una cita, orienta primero y pregunta que tipo de cita necesita.",
    ].join("\n\n"),
  });

  return aiText?.trim() || null;
}

async function retrieveOfficialContext(
  message: string,
  intent: ResolvedIntent,
  profile: AssistantProfile,
  context: {
    lastPlace: string | null;
    lastSuggestedItems: string[];
  },
): Promise<RetrievalBundle> {
  const [announcements, knowledgeEntries] = await Promise.all([
    listAnnouncements(),
    listKnowledgeEntries(),
  ]);
  const allKnowledgeEntries = mergeKnowledgeEntries(knowledgeEntries);

  const knowledgeMatch = exactKnowledgeAnswer(
    normalizeText(message),
    intent.language,
    allKnowledgeEntries,
  );
  const matchedKnowledgeEntries = knowledgeMatch
    ? [knowledgeMatch]
    : searchKnowledgeEntries(message, intent.topic, intent.language, allKnowledgeEntries);
  const matchedAnnouncements =
    intent.topic === "NEWS"
      ? getLatestAnnouncements(announcements, "NEWS", 5)
      : searchAnnouncements(message, intent.topic, intent.timeframe, announcements, profile);
  const matchedPlaces = (() => {
    const directPlaceMatches = searchPlaces(message);

    if (directPlaceMatches.length) {
      return directPlaceMatches;
    }

    if (context.lastPlace && shouldUseLastPlaceReference(normalizeText(message))) {
      return searchPlaces(context.lastPlace);
    }

    if (intent.tourismIntent) {
      return searchTourismPlaces(message);
    }

    return [];
  })();

  return {
    announcements: matchedAnnouncements,
    knowledgeEntries: matchedKnowledgeEntries,
    placeMatches: matchedPlaces,
    sources: buildSourceRefs(matchedKnowledgeEntries, matchedAnnouncements, matchedPlaces),
  };
}

function buildDeterministicReply(
  message: string,
  intent: ResolvedIntent,
  retrieval: RetrievalBundle,
): DraftReplyResult {
  const copy = getCopy(intent.language);

  if (intent.tourismIntent) {
    return {
      reply: buildTourismReply(
        retrieval.announcements,
        retrieval.placeMatches,
        intent.timeframe,
        intent.language,
      ),
      route:
        retrieval.announcements.length || retrieval.placeMatches.length
          ? "KNOWLEDGE_BASE"
          : "FALLBACK",
      usedOpenAI: false,
    };
  }

  if (intent.appointmentIntent) {
    return {
      reply: buildAppointmentReply(message, retrieval.placeMatches, intent.language),
      route: "RULE_BASED",
      usedOpenAI: false,
    };
  }

  if (intent.automotiveIntent) {
    return {
      reply: buildAutomotiveReply(
        retrieval.placeMatches.map((place) => place.name).join(" "),
        intent.language,
      ),
      route: "KNOWLEDGE_BASE",
      usedOpenAI: false,
    };
  }

  if (intent.hoursIntent) {
    return {
      reply: buildHoursReply(retrieval.placeMatches, intent.language),
      route: retrieval.placeMatches.length ? "KNOWLEDGE_BASE" : "RULE_BASED",
      usedOpenAI: false,
    };
  }

  if (intent.assistantCapabilityIntent) {
    return {
      reply: getCopy(intent.language).capabilityReply,
      route: "RULE_BASED",
      usedOpenAI: false,
    };
  }

  if (intent.institutionalServicesIntent) {
    return {
      reply: buildInstitutionalServicesReply(message, intent.language),
      route: "KNOWLEDGE_BASE",
      usedOpenAI: false,
    };
  }

  if (retrieval.placeMatches.length && (intent.locationIntent || intent.topic === "UNKNOWN")) {
    return {
      reply: buildPlaceReply(retrieval.placeMatches, intent.language),
      route: "KNOWLEDGE_BASE",
      usedOpenAI: false,
    };
  }

  switch (intent.topic) {
    case "GREETING":
      return {
        reply: copy.greeting,
        route: "RULE_BASED",
        usedOpenAI: false,
      };
    case "DENUNCIAS":
      return {
        reply: copy.report,
        route: "RULE_BASED",
        usedOpenAI: false,
      };
    case "OUT_OF_SCOPE":
      return {
        reply: copy.outOfScope,
        route: "RULE_BASED",
        usedOpenAI: false,
      };
    case "ALERTS":
      return {
        reply: buildAlertsReply(retrieval.announcements, intent.language),
        route: retrieval.announcements.length ? "ANNOUNCEMENTS" : "FALLBACK",
        usedOpenAI: false,
      };
    case "EVENTS":
      return {
        reply: buildEventsReply(retrieval.announcements, intent.timeframe, intent.language),
        route: retrieval.announcements.length ? "ANNOUNCEMENTS" : "FALLBACK",
        usedOpenAI: false,
      };
    case "ROAD_CLOSURES":
      return {
        reply: buildRoadClosuresReply(retrieval.announcements, intent.language),
        route: retrieval.announcements.length ? "ANNOUNCEMENTS" : "FALLBACK",
        usedOpenAI: false,
      };
    case "PUBLIC_WORKS":
      return {
        reply: buildPublicWorksReply(retrieval.announcements, intent.language),
        route: retrieval.announcements.length ? "ANNOUNCEMENTS" : "FALLBACK",
        usedOpenAI: false,
      };
    case "NEWS":
      return {
        reply: buildNewsReply(retrieval.announcements, intent.language),
        route: retrieval.announcements.length ? "ANNOUNCEMENTS" : "FALLBACK",
        usedOpenAI: false,
      };
    case "OVERVIEW":
      return {
        reply: buildOverviewReply(retrieval.announcements, intent.language),
        route: retrieval.announcements.length ? "ANNOUNCEMENTS" : "FALLBACK",
        usedOpenAI: false,
      };
    case "FAQ":
    case "INSTITUTIONAL":
      return {
        reply: buildInstitutionalReply(
          retrieval.knowledgeEntries,
          retrieval.placeMatches,
          intent.language,
        ),
        route: retrieval.knowledgeEntries.length || retrieval.placeMatches.length ? "KNOWLEDGE_BASE" : "FALLBACK",
        usedOpenAI: false,
      };
    case "UNKNOWN":
    default:
      return {
        reply: buildConversationalFallback(intent, retrieval, intent.language),
        route: "FALLBACK",
        usedOpenAI: false,
      };
  }
}

function shouldUseOpenAI(
  intent: ResolvedIntent,
  retrieval: RetrievalBundle,
  allowOpenAI: boolean,
) {
  if (!allowOpenAI || !isOpenAIConfigured()) {
    return false;
  }

  if (
    intent.topic === "OUT_OF_SCOPE" ||
    intent.topic === "DENUNCIAS" ||
    intent.topic === "GREETING" ||
    intent.tourismIntent ||
    intent.appointmentIntent ||
    intent.automotiveIntent ||
    intent.hoursIntent ||
    intent.institutionalServicesIntent ||
    intent.assistantCapabilityIntent
  ) {
    return false;
  }

  if (retrieval.placeMatches.length && intent.locationIntent) {
    return false;
  }

  if (intent.topic === "OVERVIEW" || intent.topic === "UNKNOWN") {
    return true;
  }

  return retrieval.sources.length >= 2;
}

async function resolveReply(input: {
  message: string;
  intent: ResolvedIntent;
  profile: AssistantProfile;
  retrieval: RetrievalBundle;
  allowOpenAI: boolean;
}) {
  const deterministic = buildDeterministicReply(
    input.message,
    input.intent,
    input.retrieval,
  );

  if (!shouldUseOpenAI(input.intent, input.retrieval, input.allowOpenAI)) {
    return deterministic;
  }

  try {
    const aiReply = await composeHybridReply({
      message: input.message,
      intent: input.intent,
      profile: input.profile,
      retrieval: input.retrieval,
    });

    if (!aiReply) {
      return deterministic;
    }

    return {
      reply: aiReply,
      route: "HYBRID_AI" as const,
      usedOpenAI: true,
    };
  } catch (error) {
    console.warn("[assistant] OpenAI no estuvo disponible. Se usa respuesta local.", error);
    return deterministic;
  }
}

function getNextContext(input: {
  intent: ResolvedIntent;
  resolution: QueryResolution | null;
  previous: {
    lastPlace: string | null;
    lastEntityMentioned: string | null;
    lastSuggestedItems: string[];
  };
}) {
  return {
    lastTopic: input.intent.topic,
    lastTimeframe: input.intent.timeframe,
    conversationLanguage: input.intent.language,
    lastPlace: input.resolution?.primaryPlace ?? input.previous.lastPlace,
    lastEntityMentioned:
      input.resolution?.primaryPlace ??
      input.resolution?.suggestedItems[0] ??
      input.previous.lastEntityMentioned,
    lastSuggestedItems:
      input.resolution?.suggestedItems.length
        ? input.resolution.suggestedItems.slice(0, 5)
        : input.previous.lastSuggestedItems,
  };
}

function buildMeta(input: {
  topic: AssistantTopicValue;
  route: AssistantRouteValue;
  usedOpenAI: boolean;
  profile: AssistantProfile;
  sources: AssistantSourceReference[];
}): AssistantReplyMeta {
  return {
    topic: input.topic,
    route: input.route,
    usedOpenAI: input.usedOpenAI,
    openAIEnabled: isOpenAIConfigured(),
    sources: input.sources,
    profile: input.profile,
  };
}

function dedupeSources(sources: AssistantSourceReference[]) {
  const seen = new Set<string>();

  return sources.filter((source) => {
    const key = `${source.type}:${normalizeText(source.title)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function combineSubReplies(replies: string[], language: AssistantLanguage) {
  const uniqueReplies = replies.filter((reply, index) => {
    const normalizedReply = normalizeText(reply);

    return (
      normalizedReply &&
      index === replies.findIndex((candidate) => normalizeText(candidate) === normalizedReply)
    );
  });

  if (uniqueReplies.length <= 1) {
    return uniqueReplies[0] ?? "";
  }

  return `${getCopy(language).multiIntentIntro}\n\n${formatNumberedList(uniqueReplies)}`;
}

function splitMultiIntentMessage(message: string, language: AssistantLanguage) {
  const base = stripLeadingConversationalPrefix(message.replace(/\r?\n+/g, " ||| "));

  if (!base) {
    return [];
  }

  const working = base
    .replace(/\s*[,;]\s*/g, " ||| ")
    .replace(/\?\s*/g, " ||| ")
    .replace(
      /\s+(?=(?:que tramites|que tramite|dime las ultimas noticias|dime las últimas noticias|what are the latest news))/gi,
      " ||| ",
    )
    .replace(
      /\b(?:y|ademas|además|tambien|también|otra cosa|por cierto)\s+(?=(?:donde|que|qué|cual|cuál|como|cómo|quien|quién|dime|se me dano|se me daño|ultimas|últimas|noticias|horario|tramites|trámites|movilidad|complex))/gi,
      " ||| ",
    )
    .replace(
      /\b(?:and|also|plus|another thing|by the way)\s+(?=(?:where|what|who|how|latest|news|hours|history|museum))/gi,
      " ||| ",
    );

  const rawParts = working
    .split("|||")
    .map((part) =>
      stripLeadingConversationalPrefix(part)
        .replace(/\b(?:y|and)\s*$/i, "")
        .trim(),
    )
    .filter(Boolean);

  const contextualizedParts: string[] = [];
  let lastPlaceName: string | null = null;

  for (const part of rawParts) {
    let currentPart = part;
    const placeMatches = searchPlaces(part);

    if (placeMatches.length) {
      lastPlaceName = placeMatches[0].name;
    }

    if (hasHoursIntent(normalizeText(part)) && !placeMatches.length && lastPlaceName) {
      currentPart =
        language === "en" ? `${part} for ${lastPlaceName}` : `${part} de ${lastPlaceName}`;
    }

    contextualizedParts.push(currentPart);
  }

  return contextualizedParts.length ? contextualizedParts : [base];
}

async function resolveSingleQuery(input: {
  rawMessage: string;
  normalizedMessage: string;
  sessionTopic: AssistantTopicValue | null;
  sessionTimeframe: Timeframe;
  language: AssistantLanguage;
  profile: AssistantProfile;
  context: {
    lastPlace: string | null;
    lastSuggestedItems: string[];
  };
  allowOpenAI: boolean;
}): Promise<QueryResolution> {
  const intent: ResolvedIntent = {
    topic: detectTopic(input.normalizedMessage, input.sessionTopic),
    timeframe: detectTimeframe(input.normalizedMessage, input.sessionTimeframe),
    language: input.language,
    locationIntent: hasLocationIntent(input.normalizedMessage),
    automotiveIntent: hasAutomotiveIntent(input.normalizedMessage),
    institutionalServicesIntent: hasInstitutionalServicesIntent(input.normalizedMessage),
    tourismIntent: hasTourismIntent(input.normalizedMessage),
    appointmentIntent: hasAppointmentIntent(input.normalizedMessage),
    hoursIntent: hasHoursIntent(input.normalizedMessage),
    assistantCapabilityIntent: hasAssistantCapabilityIntent(input.normalizedMessage),
  };

  const retrieval = await retrieveOfficialContext(
    input.rawMessage,
    intent,
    input.profile,
    input.context,
  );
  const resolvedReply = await resolveReply({
    message: input.rawMessage,
    intent,
    profile: input.profile,
    retrieval,
    allowOpenAI: input.allowOpenAI,
  });

  return {
    ...resolvedReply,
    topic: intent.topic,
    timeframe: intent.timeframe,
    sources: retrieval.sources,
    primaryPlace: retrieval.placeMatches[0]?.name ?? null,
    suggestedItems: [
      ...retrieval.placeMatches.slice(0, 3).map((place) => place.name),
      ...retrieval.announcements.slice(0, 3).map((item) => item.title),
    ],
  };
}

export function getAssistantConfig() {
  return {
    sampleQuestions: [...assistantSampleQuestions],
    rules: [...assistantRules],
    openAIEnabled: isOpenAIConfigured(),
    openAIModel: getOpenAIModel(),
  };
}

export async function chatWithAssistant(
  sessionId: string,
  message: string,
  profile?: Partial<AssistantProfile>,
): Promise<AssistantChatResult> {
  const session = getAssistantSession(sessionId);

  if (profile) {
    updateAssistantProfile(sessionId, {
      zone: profile.zone ?? session.profile.zone,
      userType: profile.userType ?? session.profile.userType,
    });
  }

  const currentSession = getAssistantSession(sessionId);
  const normalizedMessage = normalizeText(message);
  const language = detectLanguage(
    normalizedMessage,
    currentSession.context.conversationLanguage,
  );
  const subQueries = splitMultiIntentMessage(message, language);

  addAssistantTurn(session.id, "user", message);

  const resolutions: QueryResolution[] = [];
  let rollingTopic = currentSession.context.lastTopic;
  let rollingTimeframe = currentSession.context.lastTimeframe;
  let rollingContext = {
    lastPlace: currentSession.context.lastPlace,
    lastSuggestedItems: currentSession.context.lastSuggestedItems,
  };

  for (const subQuery of subQueries) {
    const normalizedSubQuery = normalizeText(subQuery);
    const resolution = await resolveSingleQuery({
      rawMessage: subQuery,
      normalizedMessage: normalizedSubQuery,
      sessionTopic: rollingTopic,
      sessionTimeframe: rollingTimeframe,
      language,
      profile: currentSession.profile,
      context: rollingContext,
      allowOpenAI: subQueries.length === 1,
    });

    resolutions.push(resolution);
    rollingTopic = resolution.topic;
    rollingTimeframe = resolution.timeframe;
    rollingContext = {
      lastPlace: resolution.primaryPlace ?? rollingContext.lastPlace,
      lastSuggestedItems: resolution.suggestedItems.length
        ? resolution.suggestedItems
        : rollingContext.lastSuggestedItems,
    };
  }

  const lastResolution = resolutions.at(-1);
  const finalIntent: ResolvedIntent = {
    topic: lastResolution?.topic ?? detectTopic(normalizedMessage, currentSession.context.lastTopic),
    timeframe:
      lastResolution?.timeframe ??
      detectTimeframe(normalizedMessage, currentSession.context.lastTimeframe),
    language,
    locationIntent: hasLocationIntent(normalizedMessage),
    automotiveIntent: hasAutomotiveIntent(normalizedMessage),
    institutionalServicesIntent: hasInstitutionalServicesIntent(normalizedMessage),
    tourismIntent: hasTourismIntent(normalizedMessage),
    appointmentIntent: hasAppointmentIntent(normalizedMessage),
    hoursIntent: hasHoursIntent(normalizedMessage),
    assistantCapabilityIntent: hasAssistantCapabilityIntent(normalizedMessage),
  };
  const combinedReply = combineSubReplies(
    resolutions.map((resolution) => resolution.reply.trim()),
    language,
  );
  const finalReply = finalizeReply(combinedReply, language);
  const updated = addAssistantTurn(session.id, "assistant", finalReply);

  updateAssistantContext(
    sessionId,
    getNextContext({
      intent: finalIntent,
      resolution: lastResolution ?? null,
      previous: currentSession.context,
    }),
  );

  const meta = buildMeta({
    topic: resolutions[0]?.topic ?? finalIntent.topic,
    route:
      resolutions.find((resolution) => resolution.route === "HYBRID_AI")?.route ??
      resolutions.find((resolution) => resolution.route === "ANNOUNCEMENTS")?.route ??
      resolutions.find((resolution) => resolution.route === "KNOWLEDGE_BASE")?.route ??
      resolutions[0]?.route ??
      "FALLBACK",
    usedOpenAI: resolutions.some((resolution) => resolution.usedOpenAI),
    profile: currentSession.profile,
    sources: dedupeSources(resolutions.flatMap((resolution) => resolution.sources)),
  });

  await recordAssistantQuery({
    sessionId,
    userMessage: message,
    assistantReply: finalReply,
    topic: meta.topic,
    route: meta.route,
    usedOpenAI: meta.usedOpenAI,
    profile: currentSession.profile,
  });

  return {
    reply: finalReply,
    history: updated.history,
    meta,
  };
}

export function resetConversation(sessionId: string) {
  resetAssistantSession(sessionId);
  return getAssistantSession(sessionId).history;
}

export function getConversation(sessionId: string): AssistantTurn[] {
  return getAssistantSession(sessionId).history;
}

export const assistantInternals = {
  detectLanguage,
  splitMultiIntentMessage,
  hasAutomotiveIntent,
  hasInstitutionalServicesIntent,
  hasTourismIntent,
  hasAppointmentIntent,
  hasHoursIntent,
};
