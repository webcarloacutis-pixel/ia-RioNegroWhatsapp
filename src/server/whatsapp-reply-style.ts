import type { ConversationalIntent } from "@/server/intent-classifier";

export const UNKNOWN_OFFICIAL_REPLY =
  "No tengo informacion oficial sobre eso en este momento. Puedo ayudarte con tramites, servicios o reportes ciudadanos de Rionegro.";

export const UNKNOWN_OFFICIAL_DATA_REPLY =
  "No tengo informacion oficial sobre eso en este momento.";

const PROHIBITED_PHRASE_PATTERNS = [
  /a continuaci[oó]n te presento/gi,
  /a continuaci[oó]n/gi,
  /estimad[oa] ciudadan[oa]/gi,
  /seg[uú]n la informaci[oó]n disponible/gi,
  /te puedo compartir las siguientes dependencias/gi,
  /aqu[ií] tienes una lista completa/gi,
  /la alcald[ií]a cuenta con m[uú]ltiples canales/gi,
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function userAskedForList(userMessage: string) {
  const normalized = normalizeText(userMessage);

  return /(pasos|requisitos|documentos|opciones|lista|dependencias|secretarias|cuales|varias|varios)/.test(
    normalized,
  );
}

function isSimpleIntent(intent: ConversationalIntent, userMessage: string) {
  return (
    ["GREETING", "THANKS", "OUT_OF_SCOPE", "ABSURD_OR_UNKNOWN", "AMBIGUOUS"].includes(intent) ||
    wordCount(userMessage) <= 8
  );
}

function stripProhibitedPhrases(reply: string) {
  return PROHIBITED_PHRASE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ""),
    reply,
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripUnneededBullets(reply: string) {
  return reply
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[-*]|\d+[.)])\s+/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function capParagraphs(reply: string, maxParagraphs: number) {
  const paragraphs = reply
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  return paragraphs.slice(0, maxParagraphs).join("\n\n");
}

export function formatWhatsAppReply(input: {
  reply: string;
  intent: ConversationalIntent;
  userMessage: string;
  sourceConfidence?: number;
}) {
  if (input.intent === "THANKS") {
    return "Con mucho gusto.";
  }

  if (input.intent === "GREETING") {
    return "Hola! En que te puedo ayudar hoy?";
  }

  if (input.intent === "OUT_OF_SCOPE" || input.intent === "ABSURD_OR_UNKNOWN") {
    return UNKNOWN_OFFICIAL_REPLY;
  }

  let cleaned = stripProhibitedPhrases(input.reply);

  if (!userAskedForList(input.userMessage) && isSimpleIntent(input.intent, input.userMessage)) {
    cleaned = stripUnneededBullets(cleaned);
  }

  if (isSimpleIntent(input.intent, input.userMessage)) {
    cleaned = capParagraphs(cleaned, 2);
  }

  if (input.sourceConfidence !== undefined && input.sourceConfidence < 0.45) {
    return UNKNOWN_OFFICIAL_DATA_REPLY;
  }

  return cleaned || UNKNOWN_OFFICIAL_DATA_REPLY;
}

export function validateAnswerGrounding(input: {
  userMessage: string;
  answer: string;
  retrievedKnowledge: Array<{ title: string; type?: string }> | string[];
  intent: ConversationalIntent;
  officialDataRequested?: boolean;
}) {
  if (input.intent === "OUT_OF_SCOPE" || input.intent === "ABSURD_OR_UNKNOWN") {
    return {
      answer: UNKNOWN_OFFICIAL_REPLY,
      blocked: true,
      reason: "Intent fuera de alcance; se evita fallback municipal.",
    };
  }

  const normalizedUserMessage = normalizeText(input.userMessage);
  const normalizedAnswer = normalizeText(input.answer);
  const hasKnowledge = input.retrievedKnowledge.length > 0;

  if (input.officialDataRequested && !hasKnowledge) {
    return {
      answer: UNKNOWN_OFFICIAL_DATA_REPLY,
      blocked: true,
      reason: "La pregunta pide dato oficial, pero no hay fuente recuperada.",
    };
  }

  const dependencyDump =
    normalizedAnswer.includes("secretaria") &&
    normalizedAnswer.includes("dependencia") &&
    !/(dependencia|dependencias|secretaria|secretarias|oficina|oficinas)/.test(
      normalizedUserMessage,
    );

  if (dependencyDump) {
    return {
      answer: UNKNOWN_OFFICIAL_DATA_REPLY,
      blocked: true,
      reason: "La respuesta agrega dependencias que el usuario no pidio.",
    };
  }

  const cleaned = stripProhibitedPhrases(input.answer);

  return {
    answer: cleaned,
    blocked: cleaned !== input.answer,
    reason: cleaned !== input.answer ? "Se quitaron frases prohibidas." : "Respuesta permitida.",
  };
}

export const whatsappReplyStyleInternals = {
  normalizeText,
  stripProhibitedPhrases,
  stripUnneededBullets,
  capParagraphs,
  userAskedForList,
};
