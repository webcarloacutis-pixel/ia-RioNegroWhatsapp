import test from "node:test";
import assert from "node:assert/strict";

import {
  sendMessage,
  sendWhatsAppAudio,
  sendWhatsAppImage,
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
  assert.equal(result.simulated, true);
  assert.equal(result.provider, "mock");
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

test("sendWhatsAppImage en dry-run no depende de token ni envia real", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousToken = process.env.ULTRAMSG_TOKEN;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.ULTRAMSG_TOKEN = "";

  const result = await sendWhatsAppImage({
    to: "+573001330213",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/flyer.png",
    caption: "Prueba flyer",
  });

  assert.equal(result.sent, true);
  assert.equal(result.simulated, true);
  assert.equal(result.provider, "ultramsg");

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.ULTRAMSG_TOKEN = previousToken;
});

test("sendWhatsAppAudio en dry-run acepta URL publica sin enviar real", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousToken = process.env.ULTRAMSG_TOKEN;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.ULTRAMSG_TOKEN = "";

  const result = await sendWhatsAppAudio({
    to: "+573001330213",
    audioUrl: "https://res.cloudinary.com/demo/video/upload/audio.mp3",
    caption: "Audio de prueba",
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
  assert.equal(result.simulated, true);
  assert.equal(result.sent, false);
  assert.match(result.log, /Dry-run UltraMsg OK/);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("sendMessage en dry-run simula comunicado con audio", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.WHATSAPP_SAFE_MODE = "true";

  const result = await sendMessage({
    title: "Mensaje del alcalde",
    message: "Mensaje institucional con nota de voz.",
    segment: {
      id: "seg-audio",
      name: "Prueba audio",
      estimatedUsers: 1,
      recipientPhones: ["+573001330213"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "MANUAL",
    audioUrl: "https://res.cloudinary.com/demo/video/upload/audio.mp3",
  });

  assert.equal(result.deliveredCount, 1);
  assert.equal(result.simulated, true);
  assert.equal(result.type, "audio");
  assert.match(result.log, /con audio/);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("sendMessage en dry-run simula UltraMsg con imagen adjunta", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.WHATSAPP_SAFE_MODE = "true";

  const result = await sendMessage({
    message: "Comunicado con flyer",
    segment: {
      id: "seg-image",
      name: "Prueba imagen",
      estimatedUsers: 1,
      recipientPhones: ["+573001330213"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "MANUAL",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/flyer.png",
  });

  assert.equal(result.deliveredCount, 1);
  assert.equal(result.simulated, true);
  assert.equal(result.type, "image");
  assert.match(result.log, /con imagen/);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("sendMessage en dry-run simula comunicado con imagen y audio", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.WHATSAPP_SAFE_MODE = "true";

  const result = await sendMessage({
    title: "Mensaje con medios",
    message: "Comunicado con flyer y nota de voz.",
    segment: {
      id: "seg-mixed",
      name: "Prueba mixta",
      estimatedUsers: 1,
      recipientPhones: ["+573001330213"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "MANUAL",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/flyer.png",
    audioUrl: "https://res.cloudinary.com/demo/video/upload/audio.mp3",
  });

  assert.equal(result.deliveredCount, 1);
  assert.equal(result.simulated, true);
  assert.equal(result.type, "mixed");
  assert.match(result.log, /imagen y audio/);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("sendMessage con WHATSAPP_SAFE_MODE bloquea envio proactivo real", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;

  process.env.WHATSAPP_DRY_RUN = "false";
  process.env.WHATSAPP_SAFE_MODE = "true";

  const result = await sendMessage({
    message: "Comunicado bloqueado",
    segment: {
      id: "seg-safe",
      name: "Prueba safe",
      estimatedUsers: 1,
      recipientPhones: ["+573001330213"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "MANUAL",
  });

  assert.equal(result.sent, false);
  assert.equal(result.simulated, true);
  assert.equal(result.blockedBySafeMode, true);
  assert.equal(result.provider, "mock");
  assert.match(result.log, /modo seguro/i);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("sendMessage con audio respeta WHATSAPP_SAFE_MODE sin dry-run", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;

  process.env.WHATSAPP_DRY_RUN = "false";
  process.env.WHATSAPP_SAFE_MODE = "true";

  const result = await sendMessage({
    title: "Comunicado bloqueado",
    message: "Comunicado con audio bloqueado por modo seguro.",
    segment: {
      id: "seg-safe-audio",
      name: "Prueba safe audio",
      estimatedUsers: 1,
      recipientPhones: ["+573001330213"],
    },
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    mode: "MANUAL",
    audioUrl: "https://res.cloudinary.com/demo/video/upload/audio.mp3",
  });

  assert.equal(result.sent, false);
  assert.equal(result.simulated, true);
  assert.equal(result.blockedBySafeMode, true);
  assert.equal(result.type, "audio");
  assert.match(result.log, /modo seguro/i);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
});

test("sendMessage falla claramente cuando no hay destinatarios", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;
  const previousDefaultTo = process.env.ULTRAMSG_DEFAULT_TO;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.WHATSAPP_SAFE_MODE = "false";
  process.env.ULTRAMSG_DEFAULT_TO = "";

  await assert.rejects(
    () =>
      sendMessage({
        message: "Comunicado sin destinatarios",
        segment: {
          id: "seg-empty",
          name: "Sin telefonos",
          estimatedUsers: 0,
          recipientPhones: [],
        },
        scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
        mode: "MANUAL",
      }),
    /Sin destinatarios/i,
  );

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
  process.env.ULTRAMSG_DEFAULT_TO = previousDefaultTo;
});

test("sendMessage bloquea envio real que supera maximo de destinatarios", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousSafeMode = process.env.WHATSAPP_SAFE_MODE;
  const previousToken = process.env.ULTRAMSG_TOKEN;
  const previousBaseUrl = process.env.ULTRAMSG_BASE_URL;
  const previousMax = process.env.MASS_MESSAGE_MAX_RECIPIENTS;

  process.env.WHATSAPP_DRY_RUN = "false";
  process.env.WHATSAPP_SAFE_MODE = "false";
  process.env.ULTRAMSG_TOKEN = "token-test";
  process.env.ULTRAMSG_BASE_URL = "https://api.ultramsg.com/instance-test";
  process.env.MASS_MESSAGE_MAX_RECIPIENTS = "2";

  try {
    await assert.rejects(
      () =>
        sendMessage({
          message: "Comunicado real grande",
          segment: {
            id: "seg-large",
            name: "Segmento grande",
            estimatedUsers: 3,
            recipientPhones: ["+573001111111", "+573002222222", "+573003333333"],
          },
          scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
          mode: "MANUAL",
        }),
      /supera el maximo/i,
    );
  } finally {
    process.env.WHATSAPP_DRY_RUN = previousDryRun;
    process.env.WHATSAPP_SAFE_MODE = previousSafeMode;
    process.env.ULTRAMSG_TOKEN = previousToken;
    process.env.ULTRAMSG_BASE_URL = previousBaseUrl;
    process.env.MASS_MESSAGE_MAX_RECIPIENTS = previousMax;
  }
});

test("ULTRAMSG_DEFAULT_TO cuenta como destinatario explicito para envio real", () => {
  const previousDefaultTo = process.env.ULTRAMSG_DEFAULT_TO;

  process.env.ULTRAMSG_DEFAULT_TO = "+573001111111";

  try {
    assert.equal(
      messageServiceInternals.hasExplicitMassMessageRecipients({
        segment: {
          id: "seg-default",
          name: "Segmento sin telefonos",
          estimatedUsers: 1,
          recipientPhones: [],
        },
        to: "",
      }),
      true,
    );
  } finally {
    process.env.ULTRAMSG_DEFAULT_TO = previousDefaultTo;
  }
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
