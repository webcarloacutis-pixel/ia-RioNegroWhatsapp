import test from "node:test";
import assert from "node:assert/strict";

import { sendMessage, messageServiceInternals } from "@/server/messageService";

test("normalizeRecipient normaliza numeros colombianos", () => {
  assert.equal(messageServiceInternals.normalizeRecipient("310 885 3250"), "+573108853250");
  assert.equal(messageServiceInternals.normalizeRecipient("+57 316 2215323"), "+573162215323");
  assert.equal(messageServiceInternals.normalizeRecipient(""), null);
});

test("resolveRecipients deduplica y acepta varios separadores", () => {
  const recipients = messageServiceInternals.resolveRecipients(
    "3108853250\n+57 316 2215323, 3234725938;3108853250",
  );

  assert.deepEqual(recipients, [
    "+573108853250",
    "+573162215323",
    "+573234725938",
  ]);
});

test("sendMessage en modo DEMO devuelve conteo estimado sin depender de UltraMsg", async () => {
  const result = await sendMessage({
    message: "Prueba de envio",
    segment: {
      id: "seg-1",
      name: "Cobertura municipal",
      estimatedUsers: 120,
      recipientPhones: ["+573108853250", "+573162215323"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "DEMO",
  });

  assert.equal(result.deliveredCount, 2);
  assert.match(result.log, /Enviado a 2 usuarios/);
});
