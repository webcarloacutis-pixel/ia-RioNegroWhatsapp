import assert from "node:assert/strict";

import { getAssistantSession } from "@/server/assistant-session";
import { chatWithAssistant, resetConversation } from "@/server/rionegro-assistant";

function countOccurrences(text: string, fragment: string) {
  return text.split(fragment).length - 1;
}

async function runCase(sessionId: string, input: string) {
  resetConversation(sessionId);
  const result = await chatWithAssistant(sessionId, input);
  const language = getAssistantSession(sessionId).context.conversationLanguage;

  return {
    reply: result.reply,
    language,
  };
}

async function main() {
  const historyCase = await runCase("qa-history-es", "cual es la historia de rionegro");
  assert.equal(historyCase.language, "es");
  assert.match(historyCase.reply, /Rionegro .*1541|Convenci[oó]n de Rionegro|Cuna de la Constituci[oó]n/i);
  assert.doesNotMatch(historyCase.reply, /\bwhere is\b|\blatest news\b|\bThis is the official information channel\b/i);

  const multiIntentCase = await runCase(
    "qa-multi-es",
    "y complex donde queda, se me dano el carro donde lo puedo arreglar que tramites puedo realizar en la alcaldia de rionegro y dime las ultimas noticias de rionegro",
  );
  assert.equal(multiIntentCase.language, "es");
  assert.match(multiIntentCase.reply, /1\.\s+Complex Llanogrande queda en/i);
  assert.match(multiIntentCase.reply, /2\./);
  assert.match(multiIntentCase.reply, /3\./);
  assert.match(multiIntentCase.reply, /4\./);
  assert.match(multiIntentCase.reply, /Autolarte Rionegro|Belchite|Quebrada Arriba/i);
  assert.match(multiIntentCase.reply, /tramites y consultas relacionados/i);
  assert.match(multiIntentCase.reply, /noticias recientes de Rionegro/i);
  assert.equal(
    countOccurrences(
      multiIntentCase.reply,
      "Este es el canal oficial de informacion del municipio de Rionegro.",
    ),
    0,
  );

  const englishCase = await runCase(
    "qa-multi-en",
    "where is the history museum and what are the latest news from rionegro?",
  );
  assert.equal(englishCase.language, "en");
  assert.match(englishCase.reply, /1\.\s+Casa de la Convencion|1\.\s+.*is at/i);
  assert.match(englishCase.reply, /2\.\s+These are some of the latest news items from Rionegro/i);
  assert.doesNotMatch(
    englishCase.reply,
    /This is the official information channel of the municipality of Rionegro\./i,
  );

  const scheduleCase = await runCase(
    "qa-hours-es",
    "ademas donde queda movilidad y que horario tiene",
  );
  assert.equal(scheduleCase.language, "es");
  assert.match(scheduleCase.reply, /SOMOS \(Movilidad y Transito\)/i);
  assert.match(scheduleCase.reply, /Horario de atencion/i);

  const tourismCase = await runCase(
    "qa-tourism-es",
    "que lugares hay de interes en rionegro",
  );
  assert.equal(tourismCase.language, "es");
  assert.match(
    tourismCase.reply,
    /lugares y planes de interes|lugares que puedes visitar|buena opcion para caminar|representativo de Rionegro/i,
  );
  assert.match(
    tourismCase.reply,
    /Parque Principal|San Antonio de Pereira|Casa de la Convencion|Catedral de San Nicolas/i,
  );

  const appointmentCase = await runCase(
    "qa-appointment-es",
    "necesito una cita para movilidad",
  );
  assert.equal(appointmentCase.language, "es");
  assert.match(appointmentCase.reply, /no se agendan citas directamente por WhatsApp/i);
  assert.match(appointmentCase.reply, /SOMOS \(Movilidad y Transito\)/i);

  const plansCase = await runCase(
    "qa-plans-es",
    "que puedo hacer hoy en rionegro",
  );
  assert.equal(plansCase.language, "es");
  assert.match(
    plansCase.reply,
    /lugares y planes de interes|planes disponibles|buena opcion para caminar|representativo de Rionegro/i,
  );
  assert.doesNotMatch(plansCase.reply, /I do not have that information/i);

  resetConversation("qa-context-es");
  await chatWithAssistant("qa-context-es", "que puedo hacer en rionegro");
  const contextCase = await chatWithAssistant("qa-context-es", "que puedo hacer en complex");
  assert.match(contextCase.reply, /Complex Llanogrande|complex/i);
  assert.doesNotMatch(contextCase.reply, /Este es el canal oficial de informacion del municipio de Rionegro/i);

  console.log("QA assistant: 8/8 pruebas aprobadas.");
}

void main();
