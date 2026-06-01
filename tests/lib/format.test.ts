import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatDeliveryModeLabel,
  formatStatusLabel,
  formatTypeLabel,
  toDateTimeLocalValue,
} from "@/lib/format";

test("formatDate y formatDateTime manejan valores vacios", () => {
  assert.equal(formatDate(null), "Sin fecha");
  assert.equal(formatDateTime(undefined), "Sin fecha");
});

test("formatCompactNumber y etiquetas muestran valores legibles", () => {
  assert.equal(formatCompactNumber(12500), "12.500");
  assert.equal(formatTypeLabel("ROAD_CLOSURE"), "Cierre vial");
  assert.equal(formatStatusLabel("SENT"), "Enviado");
  assert.equal(formatDeliveryModeLabel("MANUAL"), "Enviar ahora");
});

test("toDateTimeLocalValue construye el valor local para inputs datetime-local", () => {
  const value = toDateTimeLocalValue("2026-04-20T15:45:00.000Z");
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("formatDate y formatDateTime formatean fechas reales", () => {
  const value = "2026-04-20T15:45:00.000Z";
  assert.match(formatDate(value), /\d{1,2}\/\d{1,2}\/\d{4}|20 abr 2026|20 de abr/i);
  assert.ok(formatDateTime(value).length > formatDate(value).length);
});
