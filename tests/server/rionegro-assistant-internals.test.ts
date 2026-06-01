import test from "node:test";
import assert from "node:assert/strict";

import { assistantInternals } from "@/server/rionegro-assistant";

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
});
