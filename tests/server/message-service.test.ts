import test from "node:test";
import assert from "node:assert/strict";

import {
  sendMessage,
  sendWhatsAppText,
  messageServiceInternals,
} from "@/server/messageService";

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

test("sendWhatsAppText en dry-run no depende de token ni envia real", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousToken = process.env.ULTRAMSG_TOKEN;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.ULTRAMSG_TOKEN = "";

  const result = await sendWhatsAppText({
    to: "+573001330213",
    message: "Prueba dry-run",
    inboundReply: false,
  });

  assert.equal(result.sent, true);
  assert.equal(result.simulated, true);
  assert.equal(result.provider, "ultramsg");

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.ULTRAMSG_TOKEN = previousToken;
});

test("sendMessage en dry-run simula UltraMsg con destinatarios", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.WHATSAPP_SAFE_MODE = "true";

  const result = await sendMessage({
    message: "Comunicado de prueba",
    segment: {
      id: "seg-test",
      name: "Prueba",
      estimatedUsers: 1,
      recipientPhones: ["+573001330213"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "MANUAL",
  });

  assert.equal(result.deliveredCount, 1);
  assert.match(result.log, /Dry-run UltraMsg OK/);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("ULTRAMSG_MOCK bloquea llamadas reales aunque WHATSAPP_DRY_RUN este apagado", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousUltraMsgMock = process.env.ULTRAMSG_MOCK;
  const previousToken = process.env.ULTRAMSG_TOKEN;

  process.env.WHATSAPP_DRY_RUN = "false";
  process.env.ULTRAMSG_MOCK = "true";
  process.env.ULTRAMSG_TOKEN = "";

  const result = await sendWhatsAppText({
    to: "+573001330213",
    message: "Prueba UltraMsg mock",
  });

  assert.equal(result.sent, true);
  assert.equal(result.simulated, true);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.ULTRAMSG_MOCK = previousUltraMsgMock;
  process.env.ULTRAMSG_TOKEN = previousToken;
});
