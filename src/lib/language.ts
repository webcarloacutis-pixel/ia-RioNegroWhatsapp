export type SupportedLanguage = "es" | "en";

export type UserLanguageDetection = {
  language: SupportedLanguage;
  confidence: number;
  reason: string;
};

type ConversationHistoryItem = {
  role?: string;
  content?: string | null;
};

const ENGLISH_EXPLICIT_PATTERNS = [
  /\banswer\s+in\s+english\b/,
  /\brespond\s+in\s+english\b/,
  /\bin\s+english\b/,
  /\benglish\s+please\b/,
];

const SPANISH_EXPLICIT_PATTERNS = [
  /\bresponde\s+en\s+espanol\b/,
  /\bresponder\s+en\s+espanol\b/,
  /\ben\s+espanol\b/,
  /\bespanol\s+por\s+favor\b/,
];

const ENGLISH_HINTS = [
  "can you help me",
  "where is",
  "where can",
  "how can i",
  "how do i",
  "i need",
  "what time",
  "what are",
  "opening hours",
  "business hours",
  "city hall",
  "mayor's office",
  "municipal office",
  "report an incident",
  "there is",
  "thank you",
  "thanks",
  "hello",
  "hi",
];

const SPANISH_HINTS = [
  "donde queda",
  "donde esta",
  "como hago",
  "necesito",
  "cual es",
  "horario",
  "alcaldia",
  "tramite",
  "tramites",
  "impuesto",
  "predial",
  "gracias",
  "hola",
  "buenas",
];

const ENGLISH_WORDS = new Set([
  "accident",
  "address",
  "can",
  "city",
  "downtown",
  "english",
  "fire",
  "hall",
  "help",
  "hours",
  "how",
  "i",
  "is",
  "need",
  "opening",
  "report",
  "schedule",
  "the",
  "there",
  "time",
  "what",
  "where",
]);

const SPANISH_WORDS = new Set([
  "alcaldia",
  "como",
  "cual",
  "donde",
  "el",
  "en",
  "es",
  "espanol",
  "esta",
  "horario",
  "la",
  "necesito",
  "queda",
  "que",
  "reporte",
  "tramite",
  "ubicacion",
]);

function normalizeLanguageText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countHintScore(text: string, hints: string[]) {
  return hints.reduce((score, hint) => {
    return text.includes(hint) ? score + (hint.includes(" ") ? 3 : 1) : score;
  }, 0);
}

function countDictionaryScore(tokens: string[], dictionary: Set<string>) {
  return tokens.reduce((score, token) => score + (dictionary.has(token) ? 1 : 0), 0);
}

function getLastConversationLanguage(history?: ConversationHistoryItem[]): SupportedLanguage | null {
  const lastAssistantOrUser = history
    ?.slice()
    .reverse()
    .find((item) => item.content?.trim());

  if (!lastAssistantOrUser?.content) {
    return null;
  }

  const normalized = normalizeLanguageText(lastAssistantOrUser.content);
  const english = countHintScore(normalized, ENGLISH_HINTS);
  const spanish = countHintScore(normalized, SPANISH_HINTS);

  if (english > spanish + 1) return "en";
  if (spanish > english + 1) return "es";
  return null;
}

export function detectUserLanguage(input: {
  text?: string | null;
  transcription?: string | null;
  conversationHistory?: ConversationHistoryItem[];
}): UserLanguageDetection {
  const rawText = [input.text, input.transcription].filter(Boolean).join(" ").trim();
  const normalized = normalizeLanguageText(rawText);

  if (!normalized) {
    const historyLanguage = getLastConversationLanguage(input.conversationHistory);
    return {
      language: historyLanguage ?? "es",
      confidence: historyLanguage ? 0.68 : 0.5,
      reason: historyLanguage ? "Idioma tomado del contexto reciente." : "Sin texto suficiente; espanol por defecto.",
    };
  }

  if (ENGLISH_EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      language: "en",
      confidence: 0.98,
      reason: "El usuario pidio responder en ingles.",
    };
  }

  if (SPANISH_EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      language: "es",
      confidence: 0.98,
      reason: "El usuario pidio responder en espanol.",
    };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  let englishScore =
    countHintScore(normalized, ENGLISH_HINTS) + countDictionaryScore(tokens, ENGLISH_WORDS);
  let spanishScore =
    countHintScore(normalized, SPANISH_HINTS) + countDictionaryScore(tokens, SPANISH_WORDS);

  if (/[\u00bf\u00a1\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/i.test(rawText)) {
    spanishScore += 3;
  }

  if (/\b(the|and|from|where|what|how|there|need|please)\b/.test(normalized)) {
    englishScore += 2;
  }

  if (/\b(el|la|los|las|de|del|donde|como|que|cual|necesito)\b/.test(normalized)) {
    spanishScore += 2;
  }

  if (englishScore > spanishScore) {
    const gap = englishScore - spanishScore;
    return {
      language: "en",
      confidence: Math.min(0.95, 0.62 + gap * 0.06),
      reason: "Predominan senales del ingles en el mensaje.",
    };
  }

  if (spanishScore > englishScore) {
    const gap = spanishScore - englishScore;
    return {
      language: "es",
      confidence: Math.min(0.95, 0.62 + gap * 0.06),
      reason: "Predominan senales del espanol en el mensaje.",
    };
  }

  return {
    language: "es",
    confidence: 0.56,
    reason: "Idioma ambiguo; espanol por defecto.",
  };
}
