import test from "node:test";
import assert from "node:assert/strict";

import { detectCitizenReportIntent } from "@/server/citizen-report-service";

test("detecta accidente como reporte ciudadano urgente antes del asistente general", () => {
  const intent = detectCitizenReportIntent(
    "Hay un accidente en la via Llanogrande",
  );

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Accidente");
  assert.equal(intent.priority, "urgent");
  assert.equal(intent.needsLocation, false);
  assert.match(intent.location ?? "", /Llanogrande/i);
});

test("no marca preguntas generales de la Alcaldia como reportes", () => {
  const intent = detectCitizenReportIntent("Hola, donde queda la Alcaldia?");

  assert.equal(intent.isReport, false);
});

test("pide ubicacion cuando el reporte no trae sector claro", () => {
  const intent = detectCitizenReportIntent("Hay un hueco peligroso");

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Hueco en vía");
  assert.equal(intent.priority, "normal");
  assert.equal(intent.needsLocation, true);
});

test("detecta reportes de arbol caido con sector escrito como via", () => {
  const intent = detectCitizenReportIntent("Se cayo un arbol via Ojos de Agua");

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Árbol caído");
  assert.equal(intent.priority, "high");
  assert.equal(intent.needsLocation, false);
  assert.match(intent.location ?? "", /Ojos de Agua/i);
});

test("clasifica situaciones graves como urgentes", () => {
  const incendio = detectCitizenReportIntent(
    "Hay un incendio en una casa en San Antonio",
  );
  const disparos = detectCitizenReportIntent("Escuche disparos cerca al parque");

  assert.equal(incendio.category, "Incendio");
  assert.equal(incendio.priority, "urgent");
  assert.equal(incendio.isUrgentSituation, true);
  assert.equal(disparos.category, "Seguridad");
  assert.equal(disparos.priority, "urgent");
});
