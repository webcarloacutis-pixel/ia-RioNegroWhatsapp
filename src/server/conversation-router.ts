import {
  analyzeUserMessageIntent,
  type AnalyzedUserMessageIntent,
  type ConversationContext,
} from "@/server/intent-classifier";
import { getEmergencyContactReference, getEmergencyContacts } from "@/server/emergency-contacts";
import { UNKNOWN_OFFICIAL_REPLY } from "@/server/whatsapp-reply-style";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildClarifyingQuestion(message: string) {
  const normalized = normalizeText(message);

  if (/(impuesto|impuestos|pago|pagos|rentas)/.test(normalized)) {
    return "Claro. Te refieres al impuesto predial, industria y comercio u otro pago?";
  }

  if (/(tramite|tramites)/.test(normalized)) {
    return "Claro. Que tramite necesitas hacer?";
  }

  if (/(denuncia|reporte|reportar)/.test(normalized)) {
    return "Claro. Cuentame que paso y en que sector para poder registrar el reporte.";
  }

  return "Claro. Me cuentas un poco mas para poder orientarte bien?";
}

export function buildCitizenReportAssistantPrompt(analysis: AnalyzedUserMessageIntent) {
  if (analysis.intent === "EMERGENCY_REPORT") {
    return [
      "Gracias por avisar. Registramos el reporte como posible situacion urgente.",
      "",
      `Si hay personas heridas o riesgo inmediato, comunicate tambien con ${getEmergencyContactReference()}.`,
    ].join("\n");
  }

  return "Gracias por reportarlo. Para registrarlo bien, dime por favor la ubicacion exacta o el sector donde ocurrio. Si puedes, envia tambien una foto del lugar.";
}

export function getPreAssistantReply(
  message: string,
  analysis: AnalyzedUserMessageIntent,
) {
  if (analysis.intent === "THANKS") {
    return "Con mucho gusto.";
  }

  if (analysis.intent === "GREETING") {
    return "Hola! En que te puedo ayudar hoy?";
  }

  if (analysis.shouldRefuseBecauseUnknown) {
    return UNKNOWN_OFFICIAL_REPLY;
  }

  if (analysis.shouldAskClarifyingQuestion) {
    return buildClarifyingQuestion(message);
  }

  if (analysis.shouldCreateCitizenReport) {
    return buildCitizenReportAssistantPrompt(analysis);
  }

  return null;
}

export function routeConversationBeforeAssistant(
  message: string,
  context?: ConversationContext,
) {
  const analysis = analyzeUserMessageIntent(message, context);

  return {
    analysis,
    reply: getPreAssistantReply(message, analysis),
  };
}

export { getEmergencyContactReference, getEmergencyContacts };
