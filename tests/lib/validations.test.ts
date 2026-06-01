import test from "node:test";
import assert from "node:assert/strict";

import {
  announcementInputSchema,
  knowledgeInputSchema,
  loginSchema,
  segmentInputSchema,
} from "@/lib/validations";

test("loginSchema valida credenciales basicas", () => {
  const payload = loginSchema.parse({
    email: "admin@rionegro.gov",
    password: "segura123",
  });

  assert.equal(payload.email, "admin@rionegro.gov");
});

test("announcementInputSchema normaliza tipo y campos opcionales", () => {
  const payload = announcementInputSchema.parse({
    title: "Cierre preventivo",
    message: "Habra cierre preventivo en la via principal por mantenimiento.",
    location: "",
    type: "cierre vial",
    scheduledAt: "2026-04-20T10:00",
    segmentId: "",
  });

  assert.equal(payload.type, "CIERRE_VIAL");
  assert.equal(payload.location, null);
  assert.equal(payload.segmentId, null);
});

test("segmentInputSchema limpia y deduplica numeros", () => {
  const payload = segmentInputSchema.parse({
    name: "Movilidad",
    description: "Conductores",
    estimatedUsers: "250",
    recipientPhones: "+57 310 8853250\n3108853250, +57 316 2215323;3234725938",
  });

  assert.deepEqual(payload.recipientPhones, [
    "+573108853250",
    "+573162215323",
    "+573234725938",
  ]);
  assert.equal(payload.estimatedUsers, 250);
});

test("knowledgeInputSchema exige datos minimos", () => {
  const payload = knowledgeInputSchema.parse({
    question: "Donde queda movilidad?",
    answer: "Movilidad queda en Carrera 48 # 47-19.",
    category: "Movilidad",
  });

  assert.equal(payload.category, "Movilidad");
});
