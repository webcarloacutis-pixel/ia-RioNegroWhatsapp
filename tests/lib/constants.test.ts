import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAnnouncementTypeLabel,
  normalizeAnnouncementType,
  ASSISTANT_ROUTE_LABELS,
  ASSISTANT_TOPIC_LABELS,
} from "@/lib/constants";

test("normalizeAnnouncementType normaliza espacios, simbolos y mayusculas", () => {
  assert.equal(normalizeAnnouncementType("  cierre vial urgente  "), "CIERRE_VIAL_URGENTE");
  assert.equal(normalizeAnnouncementType("noticia-especial!"), "NOTICIA-ESPECIAL");
});

test("formatAnnouncementTypeLabel devuelve etiquetas conocidas y formatea personalizadas", () => {
  assert.equal(formatAnnouncementTypeLabel("EVENT"), "Evento");
  assert.equal(formatAnnouncementTypeLabel("road_closure"), "Cierre vial");
  assert.equal(formatAnnouncementTypeLabel("servicio ciudadano"), "Servicio Ciudadano");
});

test("las etiquetas del asistente conservan valores esperados", () => {
  assert.equal(ASSISTANT_TOPIC_LABELS.UNKNOWN, "Sin clasificar");
  assert.equal(ASSISTANT_ROUTE_LABELS.HYBRID_AI, "Respuesta conversacional");
});
