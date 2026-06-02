import test from "node:test";
import assert from "node:assert/strict";

import {
  assistantInternals,
  chatWithAssistant,
  resetConversation,
} from "@/server/rionegro-assistant";

test("detectLanguage conserva espanol y detecta ingles cuando corresponde", () => {
  assert.equal(assistantInternals.detectLanguage("cual es la historia de rionegro", "es"), "es");
  assert.equal(
    assistantInternals.detectLanguage("where is the history museum in rionegro", "es"),
    "en",
  );
});

test("detectTopic normaliza intenciones de turismo y noticias", () => {
  assert.equal(assistantInternals.detectTopic("que puedo hacer hoy en rionegro", null), "EVENTS");
  assert.equal(assistantInternals.detectTopic("cuales son las ultimas noticias", null), "NEWS");
});

test("detectTimeframe reconoce hoy, manana y recientes", () => {
  assert.equal(assistantInternals.detectTimeframe("que hay hoy", "none"), "today");
  assert.equal(assistantInternals.detectTimeframe("y manana", "today"), "tomorrow");
  assert.equal(assistantInternals.detectTimeframe("ultimas noticias", "none"), "recent");
});

test("splitMultiIntentMessage divide consultas encadenadas", () => {
  const parts = assistantInternals.splitMultiIntentMessage(
    "y complex donde queda, se me dano el carro donde lo puedo arreglar y dime las ultimas noticias de rionegro",
    "es",
  );

  assert.equal(parts.length, 3);
  assert.match(parts[0] ?? "", /complex/i);
  assert.match(parts[1] ?? "", /carro/i);
  assert.match(parts[2] ?? "", /noticias/i);
});

test("helpers de intencion detectan consultas frecuentes", () => {
  assert.equal(assistantInternals.hasAppointmentIntent("quiero sacar una cita"), true);
  assert.equal(assistantInternals.hasAutomotiveIntent("se me dano el carro"), true);
  assert.equal(assistantInternals.hasTourismIntent("que lugares hay de interes"), true);
  assert.equal(assistantInternals.hasInstitutionalServicesIntent("donde pago un comparendo"), true);
  assert.equal(assistantInternals.hasHoursIntent("que horario tiene movilidad"), true);
  assert.equal(assistantInternals.hasLocationIntent("donde queda san nicolas"), true);
  assert.equal(assistantInternals.hasAssistantCapabilityIntent("que haces"), true);
  assert.equal(assistantInternals.hasThanksIntent("gracias"), true);
});

test("responde ubicacion de Alcaldia de forma breve y sin bullets", async () => {
  resetConversation("unit-location-alcaldia");
  const result = await chatWithAssistant("unit-location-alcaldia", "Donde queda la Alcaldia?");

  assert.match(result.reply, /Alcaldia de Rionegro/i);
  assert.match(result.reply, /Carrera 50 # 49 - 05/i);
  assert.doesNotMatch(result.reply, /^\s*(?:[-*]|\d+[.)])\s+/m);
  assert.ok(result.reply.split(/\n{2,}/).length <= 2);
});

test("responde agradecimientos y saludos de forma corta", async () => {
  resetConversation("unit-thanks");
  const thanks = await chatWithAssistant("unit-thanks", "Gracias");
  assert.equal(thanks.reply, "Con mucho gusto.");

  resetConversation("unit-greeting");
  const greeting = await chatWithAssistant("unit-greeting", "Hola");
  assert.match(greeting.reply, /^.?Hola/i);
  assert.ok(greeting.reply.length < 90);
});

test("responde predial con orientacion especifica y sin lista generica", async () => {
  resetConversation("unit-predial");
  const result = await chatWithAssistant("unit-predial", "Necesito pagar el predial");

  assert.match(result.reply, /predial|Hacienda|Rentas/i);
  assert.doesNotMatch(result.reply, /^\s*(?:[-*]|\d+[.)])\s+/m);
  assert.doesNotMatch(result.reply, /puedes realizar tramites y consultas relacionados con:/i);
});
