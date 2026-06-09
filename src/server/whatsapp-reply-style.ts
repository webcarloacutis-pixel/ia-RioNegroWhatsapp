import type { ConversationalIntent } from "@/server/intent-classifier";
import { detectUserLanguage, type SupportedLanguage } from "@/lib/language";

export const UNKNOWN_OFFICIAL_REPLY =
  "No tengo informacion oficial sobre eso en este momento. Si quieres, puedo registrar tu consulta para que el equipo la revise o ayudarte a buscar informacion relacionada.";

export const UNKNOWN_OFFICIAL_DATA_REPLY =
  "No tengo informacion oficial sobre eso en este momento.";

export const UNKNOWN_OFFICIAL_REPLY_EN =
  "I don't have official information about that at the moment. If you want, I can help register your question for review or look for related official information.";

export const UNKNOWN_OFFICIAL_DATA_REPLY_EN =
  "I don't have official information about that at the moment.";

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

function regexWithoutGlobal(pattern: RegExp) {
  return new RegExp(pattern.source, pattern.flags.replace("g", ""));
}

function hasProhibitedPhrase(reply: string) {
  return PROHIBITED_PHRASE_PATTERNS.some((pattern) => regexWithoutGlobal(pattern).test(reply));
}

function userAskedForList(userMessage: string) {
  const normalized = normalizeText(userMessage);

  return /(pasos|requisitos|documentos|opciones|lista|dependencias|secretarias|cuales|varias|varios)/.test(
    normalized,
  );
}

function getUnknownOfficialReply(language: SupportedLanguage) {
  return language === "en" ? UNKNOWN_OFFICIAL_REPLY_EN : UNKNOWN_OFFICIAL_REPLY;
}

function getUnknownOfficialDataReply(language: SupportedLanguage) {
  return language === "en" ? UNKNOWN_OFFICIAL_DATA_REPLY_EN : UNKNOWN_OFFICIAL_DATA_REPLY;
}

function buildPrivateServiceUnknownReply(userMessage: string, language: SupportedLanguage) {
  const normalized = normalizeText(userMessage);

  if (/(veterinari|mascota|gato|perro|vet|veterinary|pet|cat|dog)/.test(normalized)) {
    if (language === "en") {
      return [
        "I don't have official information about that at the moment.",
        "",
        "If your pet is sick, I recommend contacting a nearby veterinary clinic or looking for an emergency veterinary service.",
      ].join("\n");
    }

    const animal = normalized.includes("gato")
      ? "gato"
      : normalized.includes("perro")
        ? "perro"
        : "mascota";

    return [
      "No tengo informacion oficial sobre eso en este momento.",
      "",
      `Si tu ${animal} esta enfermo, te recomiendo contactar directamente una clinica veterinaria cercana o buscar un servicio veterinario de urgencias.`,
    ].join("\n");
  }

  if (/(farmacia|drogueria|taxi|grua|hotel|restaurante|clinica|hospital|pharmacy|taxi|tow truck|restaurant|clinic)/.test(normalized)) {
    return getUnknownOfficialDataReply(language);
  }

  return null;
}

function sourceMatchesPrivateServiceQuery(
  userMessage: string,
  retrievedKnowledge: Array<{ title?: string; type?: string } | string>,
) {
  const normalizedUserMessage = normalizeText(userMessage);
  const sourceText = normalizeText(
    retrievedKnowledge
      .map((item) => (typeof item === "string" ? item : `${item.title ?? ""} ${item.type ?? ""}`))
      .join(" "),
  );

  if (/(veterinari|mascota|gato|perro|vet|veterinary|pet|cat|dog)/.test(normalizedUserMessage)) {
    return /(veterinari|mascota|gato|perro)/.test(sourceText);
  }

  if (/(farmacia|drogueria|pharmacy|drugstore)/.test(normalizedUserMessage)) {
    return /(farmacia|drogueria)/.test(sourceText);
  }

  if (/(taxi|grua|hotel|restaurante|clinica|hospital|tow truck|restaurant|clinic)/.test(normalizedUserMessage)) {
    return /(taxi|grua|hotel|restaurante|clinica|hospital)/.test(sourceText);
  }

  return false;
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

function hasKnowledgeEvidence(retrievedKnowledge?: Array<{ title?: string } | string>) {
  return Boolean(retrievedKnowledge?.length);
}

function containsUnrequestedDependencies(userMessage: string, answer: string) {
  const normalizedUserMessage = normalizeText(userMessage);
  const normalizedAnswer = normalizeText(answer);

  return (
    /(secretaria|secretarias|dependencia|dependencias|oficina|oficinas)/.test(normalizedAnswer) &&
    !/(secretaria|secretarias|dependencia|dependencias|oficina|oficinas)/.test(normalizedUserMessage)
  );
}

function isUnknownOfficialReply(answer: string) {
  const normalizedAnswer = normalizeText(answer);
  return (
    normalizedAnswer.startsWith(normalizeText(UNKNOWN_OFFICIAL_DATA_REPLY)) ||
    normalizedAnswer.startsWith(normalizeText(UNKNOWN_OFFICIAL_DATA_REPLY_EN))
  );
}

function answerLooksAlignedWithUserQuestion(input: {
  userMessage: string;
  answer: string;
  intent: ConversationalIntent;
}) {
  const normalizedUserMessage = normalizeText(input.userMessage);
  const normalizedAnswer = normalizeText(input.answer);

  if (!normalizedAnswer) return false;
  if (input.intent === "THANKS") return normalizedAnswer === "con mucho gusto." || normalizedAnswer === "you're welcome.";
  if (input.intent === "GREETING") return normalizedAnswer.includes("hola") || normalizedAnswer.includes("hi");
  if (input.intent === "OUT_OF_SCOPE" || input.intent === "ABSURD_OR_UNKNOWN") {
    return normalizedAnswer.includes("no tengo informacion oficial") || normalizedAnswer.includes("official information");
  }
  if (/(donde|direccion|ubicacion|queda|where|address|location|located|city hall)/.test(normalizedUserMessage)) {
    return /(queda|direccion|ubicacion|carrera|calle|sede|rionegro|alcaldia|located|address|city hall|downtown)/.test(normalizedAnswer);
  }
  if (/(impuesto|impuestos|predial|industria y comercio|pago|pagos|tax|taxes|property tax|payment)/.test(normalizedUserMessage)) {
    return /(impuesto|predial|industria y comercio|pago|hacienda|rentas|property tax|tax|treasury|payment|no tengo informacion oficial|official information)/.test(
      normalizedAnswer,
    );
  }

  return true;
}

export function validateFinalAnswer(input: {
  userMessage: string;
  answer: string;
  intent: ConversationalIntent;
  retrievedKnowledge?: Array<{ title?: string } | string>;
  officialDataRequested?: boolean;
}) {
  const paragraphs = input.answer
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const simple = isSimpleIntent(input.intent, input.userMessage);
  const isTooLong =
    (simple && (paragraphs.length > 2 || wordCount(input.answer) > 90)) ||
    wordCount(input.answer) > 180;
  const usesForbiddenPhrases = hasProhibitedPhrase(input.answer);
  const unrequestedDependencies = containsUnrequestedDependencies(input.userMessage, input.answer);
  const containsUnsupportedOfficialFacts =
    Boolean(input.officialDataRequested) &&
    !hasKnowledgeEvidence(input.retrievedKnowledge) &&
    !isUnknownOfficialReply(input.answer);
  const answersUserQuestion = answerLooksAlignedWithUserQuestion(input);
  const shouldRewrite =
    !answersUserQuestion ||
    isTooLong ||
    usesForbiddenPhrases ||
    unrequestedDependencies ||
    containsUnsupportedOfficialFacts;
  const reason = [
    !answersUserQuestion ? "No contesta exactamente la pregunta." : "",
    isTooLong ? "Respuesta demasiado larga." : "",
    usesForbiddenPhrases ? "Usa frases prohibidas." : "",
    unrequestedDependencies ? "Incluye dependencias no solicitadas." : "",
    containsUnsupportedOfficialFacts ? "Contiene dato oficial sin evidencia recuperada." : "",
  ]
    .filter(Boolean)
    .join(" ");

  console.log("[conversation] final answer validated", {
    answersUserQuestion,
    isTooLong,
    usesForbiddenPhrases,
    containsUnrequestedDependencies: unrequestedDependencies,
    containsUnsupportedOfficialFacts,
    shouldRewrite,
  });

  if (shouldRewrite) {
    console.log("[conversation] final answer rewritten", {
      reason,
    });
  }

  return {
    answersUserQuestion,
    isTooLong,
    usesForbiddenPhrases,
    containsUnrequestedDependencies: unrequestedDependencies,
    containsUnsupportedOfficialFacts,
    shouldRewrite,
    reason: reason || "Respuesta valida.",
  };
}

export function formatWhatsAppReply(input: {
  reply: string;
  intent: ConversationalIntent;
  userMessage: string;
  sourceConfidence?: number;
}) {
  if (input.intent === "THANKS") {
    const language = detectUserLanguage({ text: input.userMessage }).language;
    return language === "en" ? "You're welcome." : "Con mucho gusto.";
  }

  if (input.intent === "GREETING") {
    const language = detectUserLanguage({ text: input.userMessage }).language;
    return language === "en" ? "Hi! I'm Eva. How can I help you today?" : "Hola! En que te puedo ayudar hoy?";
  }

  if (input.intent === "OUT_OF_SCOPE" || input.intent === "ABSURD_OR_UNKNOWN") {
    const language = detectUserLanguage({ text: input.userMessage }).language;
    const cleaned = stripProhibitedPhrases(input.reply).trim();

    if (/\b(gustos|taste|musica|music)\b/i.test(normalizeText(cleaned))) {
      return capParagraphs(cleaned, 2);
    }

    return getUnknownOfficialReply(language);
  }

  let cleaned = stripProhibitedPhrases(input.reply);

  if (!userAskedForList(input.userMessage) && isSimpleIntent(input.intent, input.userMessage)) {
    cleaned = stripUnneededBullets(cleaned);
  }

  if (isSimpleIntent(input.intent, input.userMessage)) {
    cleaned = capParagraphs(cleaned, 2);
  }

  if (input.sourceConfidence !== undefined && input.sourceConfidence < 0.45) {
    return getUnknownOfficialDataReply(detectUserLanguage({ text: input.userMessage }).language);
  }

  const validation = validateFinalAnswer({
    userMessage: input.userMessage,
    answer: cleaned,
    intent: input.intent,
  });

  if (validation.containsUnrequestedDependencies || validation.containsUnsupportedOfficialFacts) {
    return getUnknownOfficialDataReply(detectUserLanguage({ text: input.userMessage }).language);
  }

  if (!validation.answersUserQuestion) {
    return getUnknownOfficialDataReply(detectUserLanguage({ text: input.userMessage }).language);
  }

  return cleaned || getUnknownOfficialDataReply(detectUserLanguage({ text: input.userMessage }).language);
}

export function validateAnswerGrounding(input: {
  userMessage: string;
  answer: string;
  retrievedKnowledge: Array<{ title: string; type?: string }> | string[];
  intent: ConversationalIntent;
  officialDataRequested?: boolean;
}) {
  const language = detectUserLanguage({ text: input.userMessage }).language;

  if (input.intent === "OUT_OF_SCOPE" || input.intent === "ABSURD_OR_UNKNOWN") {
    return {
      answer: getUnknownOfficialReply(language),
      blocked: true,
      reason: "Intent fuera de alcance; se evita fallback municipal.",
    };
  }

  const normalizedUserMessage = normalizeText(input.userMessage);
  const normalizedAnswer = normalizeText(input.answer);
  const hasKnowledge = input.retrievedKnowledge.length > 0;
  const hasKnowledgeBaseSource = input.retrievedKnowledge.some((item) => {
    if (typeof item === "string") return true;
    return item.type === "knowledge";
  });
  const privateServiceReply = buildPrivateServiceUnknownReply(input.userMessage, language);

  if (
    privateServiceReply &&
    (!hasKnowledgeBaseSource || !sourceMatchesPrivateServiceQuery(input.userMessage, input.retrievedKnowledge))
  ) {
    return {
      answer: privateServiceReply,
      blocked: true,
      reason: "Consulta privada sin fuente oficial recuperada.",
    };
  }

  if (input.officialDataRequested && !hasKnowledge) {
    return {
      answer: privateServiceReply ?? getUnknownOfficialDataReply(language),
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
      answer: getUnknownOfficialDataReply(language),
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
  containsUnrequestedDependencies,
  hasProhibitedPhrase,
};
