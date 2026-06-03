import axios from "axios";
import qs from "qs";

type SendMessageInput = {
  message: string;
  segment:
    | {
        id: string | null;
        name: string;
        estimatedUsers: number;
        recipientPhones?: string[];
      }
    | null;
  scheduledAt: Date;
  mode?: "DEMO" | "MANUAL" | "SCHEDULED";
  to?: string | null;
  imageUrl?: string | null;
  imageFilename?: string | null;
  imageMimeType?: string | null;
  imageSize?: number | null;
};

type SendMessageResult = {
  sent: boolean;
  simulated: boolean;
  blockedBySafeMode?: boolean;
  provider: "ultramsg" | "mock";
  type?: "text" | "image" | "text_fallback";
  message?: string;
  error?: string;
  deliveredCount: number;
  log: string;
};

type WhatsAppTextInput = {
  to: string;
  message: string;
  inboundReply?: boolean;
  inboundMessageId?: string;
};

type WhatsAppAudioInput = {
  to: string;
  audioBase64: string;
  mimeType?: string;
  caption?: string;
  inboundReply?: boolean;
  inboundMessageId?: string;
};

type WhatsAppImageInput = {
  to: string;
  imageUrl?: string | null;
  imageBase64?: string | null;
  caption?: string;
  inboundReply?: boolean;
  inboundMessageId?: string;
  announcementId?: string;
};

type SafeInboundReservation = {
  allowed: boolean;
  markSent: () => void;
};

const globalForWhatsAppMessages = globalThis as unknown as {
  __rionegroWhatsAppSentInboundIds?: Set<string>;
};

const DEFAULT_AUDIENCE = 1250;
const DEFAULT_MAX_REAL_MASS_MESSAGE_RECIPIENTS = 100;
const MAX_ULTRAMSG_IMAGE_CAPTION_LENGTH = 900;
function getUltraMsgDefaultTo() {
  return process.env.ULTRAMSG_DEFAULT_TO?.trim() ?? "";
}

function isUltraMsgConfigured() {
  return Boolean(process.env.ULTRAMSG_TOKEN?.trim() && canResolveUltraMsgBaseUrl());
}

function isWhatsAppSafeMode() {
  return process.env.WHATSAPP_SAFE_MODE === "true";
}

function isWhatsAppDryRunMode() {
  return (
    process.env.WHATSAPP_DRY_RUN === "true" ||
    process.env.ULTRAMSG_MOCK === "true" ||
    process.env.SIMULATION_MODE === "true"
  );
}

function getUltraMsgConfigError() {
  if (!process.env.ULTRAMSG_TOKEN?.trim()) {
    return "Falta ULTRAMSG_TOKEN.";
  }

  if (!canResolveUltraMsgBaseUrl()) {
    return "Falta ULTRAMSG_BASE_URL, ULTRAMSG_API_URL o ULTRAMSG_INSTANCE_ID.";
  }

  return "UltraMsg no esta configurado.";
}

function getSentInboundIds() {
  if (!globalForWhatsAppMessages.__rionegroWhatsAppSentInboundIds) {
    globalForWhatsAppMessages.__rionegroWhatsAppSentInboundIds = new Set<string>();
  }

  return globalForWhatsAppMessages.__rionegroWhatsAppSentInboundIds;
}

function canResolveUltraMsgBaseUrl() {
  return Boolean(
    process.env.ULTRAMSG_BASE_URL?.trim() ||
      process.env.ULTRAMSG_API_URL?.trim() ||
      process.env.ULTRAMSG_INSTANCE_ID?.trim(),
  );
}

function getUltraMsgBaseUrl() {
  const configuredBaseUrl =
    process.env.ULTRAMSG_BASE_URL?.trim() || process.env.ULTRAMSG_API_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const instanceId = process.env.ULTRAMSG_INSTANCE_ID?.trim();

  if (!instanceId) {
    throw new Error("Falta ULTRAMSG_INSTANCE_ID");
  }

  return `https://api.ultramsg.com/${instanceId}`;
}

function getUltraMsgToken() {
  const token = process.env.ULTRAMSG_TOKEN?.trim();

  if (!token) {
    throw new Error("Falta ULTRAMSG_TOKEN");
  }

  return token;
}

function maskRecipient(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `****${digits.slice(-4)}`;
}

function reserveSafeInboundReply(input: {
  inboundReply?: boolean;
  inboundMessageId?: string;
}) {
  if (!isWhatsAppSafeMode()) {
    return { allowed: true, markSent: () => undefined };
  }

  if (!input.inboundReply) {
    throw new Error("WHATSAPP_SAFE_MODE activo: envio proactivo bloqueado.");
  }

  if (!input.inboundMessageId) {
    throw new Error("WHATSAPP_SAFE_MODE activo: falta inboundMessageId.");
  }

  const sentInboundIds = getSentInboundIds();

  if (sentInboundIds.has(input.inboundMessageId)) {
    console.log("[whatsapp] skipped duplicate", {
      messageId: input.inboundMessageId,
      scope: "outbound_reply",
    });

    return { allowed: false, markSent: () => undefined };
  }

  return {
    allowed: true,
    markSent: () => {
      sentInboundIds.add(input.inboundMessageId as string);

      if (sentInboundIds.size > 1000) {
        const oldest = sentInboundIds.values().next().value;

        if (oldest) {
          sentInboundIds.delete(oldest);
        }
      }
    },
  };
}

function reserveSafeInboundReplyForFallback(inboundMessageId?: string): SafeInboundReservation {
  if (!isWhatsAppSafeMode() || !inboundMessageId) {
    return { allowed: true, markSent: () => undefined };
  }

  return {
    allowed: true,
    markSent: () => {
      getSentInboundIds().add(inboundMessageId);
    },
  };
}

function normalizeRecipient(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits.startsWith("57") ? `+${digits}` : `+57${digits}`;
}

function resolveRecipients(to?: string | null) {
  const rawRecipients = (to?.trim() || getUltraMsgDefaultTo())
    .split(/[,\n;]/)
    .map((value) => normalizeRecipient(value.trim()))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(rawRecipients));
}

function getMaxRealMassMessageRecipients() {
  const configured = Number(process.env.MASS_MESSAGE_MAX_RECIPIENTS);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_REAL_MASS_MESSAGE_RECIPIENTS;
}

function hasExplicitMassMessageRecipients(input: Pick<SendMessageInput, "segment" | "to">) {
  return Boolean(input.to?.trim() || input.segment?.recipientPhones?.length);
}

function assertRealMassMessagePolicy(input: Pick<SendMessageInput, "segment" | "to"> & {
  recipients: string[];
}) {
  if (!hasExplicitMassMessageRecipients(input)) {
    throw new Error(
      "Envio real bloqueado: configura destinatarios explicitos en el segmento o en el campo to.",
    );
  }

  const maxRecipients = getMaxRealMassMessageRecipients();

  if (input.recipients.length > maxRecipients) {
    throw new Error(
      `Envio real bloqueado: ${input.recipients.length} destinatarios supera el maximo permitido (${maxRecipients}).`,
    );
  }
}

export async function sendWhatsAppText({
  to,
  message,
  inboundReply = false,
  inboundMessageId,
}: WhatsAppTextInput) {
  if (isWhatsAppDryRunMode()) {
    console.log("[ultramsg] sending text", {
      to: maskRecipient(to),
      inboundReply,
      dryRun: true,
    });

    console.log("[ultramsg] reply sent", {
      to: maskRecipient(to),
      type: "text",
      dryRun: true,
    });

    return {
      sent: true,
      simulated: true,
      provider: "ultramsg",
      message: "dry-run ok",
    };
  }

  const safeReservation = reserveSafeInboundReply({
    inboundReply,
    inboundMessageId,
  });

  if (!safeReservation.allowed) {
    return {
      skipped: true,
      reason: "duplicate_inbound_reply",
    };
  }

  const token = getUltraMsgToken();
  const data = qs.stringify({
    token,
    to,
    body: message,
  });

  console.log("[ultramsg] sending text", {
    to: maskRecipient(to),
    inboundReply,
  });

  const response = await axios({
    method: "post",
    url: `${getUltraMsgBaseUrl()}/messages/chat`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data,
  });

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "text",
  });

  return response.data;
}

export async function sendWhatsAppAudio({
  to,
  audioBase64,
  caption,
  inboundReply = false,
  inboundMessageId,
}: WhatsAppAudioInput) {
  if (isWhatsAppDryRunMode()) {
    console.log("[ultramsg] sending audio", {
      to: maskRecipient(to),
      inboundReply,
      dryRun: true,
    });

    console.log("[ultramsg] reply sent", {
      to: maskRecipient(to),
      type: "audio",
      dryRun: true,
    });

    return {
      sent: true,
      simulated: true,
      provider: "ultramsg",
      message: "dry-run ok",
    };
  }

  const safeReservation = reserveSafeInboundReply({
    inboundReply,
    inboundMessageId,
  });

  if (!safeReservation.allowed) {
    return {
      skipped: true,
      reason: "duplicate_inbound_reply",
    };
  }

  const token = getUltraMsgToken();
  const cleanAudioBase64 = audioBase64.replace(
    /^data:audio\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  const data = qs.stringify({
    token,
    to,
    audio: cleanAudioBase64,
    caption,
  });

  console.log("[ultramsg] sending audio", {
    to: maskRecipient(to),
    inboundReply,
  });

  const response = await axios({
    method: "post",
    url: `${getUltraMsgBaseUrl()}/messages/audio`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data,
  });

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "audio",
  });

  return response.data;
}

export async function sendWhatsAppImage({
  to,
  imageUrl,
  imageBase64,
  caption,
  inboundReply = false,
  inboundMessageId,
  announcementId,
}: WhatsAppImageInput) {
  if (!imageUrl && !imageBase64) {
    throw new Error("Falta imageUrl o imageBase64 para enviar imagen.");
  }

  if (isWhatsAppDryRunMode()) {
    console.log("[ultramsg] sending image", {
      to: maskRecipient(to),
      inboundReply,
      announcementId,
      dryRun: true,
    });

    console.log("[ultramsg] reply sent", {
      to: maskRecipient(to),
      type: "image",
      dryRun: true,
    });

    return {
      sent: true,
      simulated: true,
      provider: "ultramsg",
      message: "dry-run ok",
    };
  }

  const safeReservation = reserveSafeInboundReply({
    inboundReply,
    inboundMessageId,
  });

  if (!safeReservation.allowed) {
    return {
      skipped: true,
      reason: "duplicate_inbound_reply",
    };
  }

  const token = getUltraMsgToken();
  const image = imageUrl ?? imageBase64?.replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  const data = qs.stringify({
    token,
    to,
    image,
    caption,
  });

  console.log("[ultramsg] sending image", {
    to: maskRecipient(to),
    inboundReply,
    announcementId,
  });

  const response = await axios({
    method: "post",
    url: `${getUltraMsgBaseUrl()}/messages/image`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data,
  });

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "image",
  });

  return response.data;
}

export async function sendWhatsAppTextAfterAudioFailure({
  to,
  message,
  inboundMessageId,
}: WhatsAppTextInput) {
  if (isWhatsAppDryRunMode()) {
    console.log("[ultramsg] sending text", {
      to: maskRecipient(to),
      inboundReply: true,
      fallback: "audio_failed",
      dryRun: true,
    });

    console.log("[ultramsg] reply sent", {
      to: maskRecipient(to),
      type: "text",
      fallback: "audio_failed",
      dryRun: true,
    });

    return {
      sent: true,
      simulated: true,
      provider: "ultramsg",
      message: "dry-run ok",
    };
  }

  const safeReservation = reserveSafeInboundReplyForFallback(inboundMessageId);
  const token = getUltraMsgToken();
  const data = qs.stringify({
    token,
    to,
    body: message,
  });

  console.log("[ultramsg] sending text", {
    to: maskRecipient(to),
    inboundReply: true,
    fallback: "audio_failed",
  });

  const response = await axios({
    method: "post",
    url: `${getUltraMsgBaseUrl()}/messages/chat`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data,
  });

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "text",
    fallback: "audio_failed",
  });

  return response.data;
}

async function sendMessageMock({
  message,
  segment,
  scheduledAt,
  mode,
  imageUrl,
}: SendMessageInput): Promise<SendMessageResult> {
  const deliveredCount = segment?.recipientPhones?.length || segment?.estimatedUsers || DEFAULT_AUDIENCE;
  const targetName = segment?.name ?? "Cobertura general";
  const preview = message.length > 80 ? `${message.slice(0, 80)}...` : message;

  console.log("[messageService] envio mock ejecutado", {
    mode,
    scheduledAt: scheduledAt.toISOString(),
    segment: targetName,
    deliveredCount,
    preview,
  });

  await new Promise((resolve) => setTimeout(resolve, 300));

  return {
    sent: true,
    simulated: true,
    provider: "mock",
    type: imageUrl ? "image" : "text",
    message: "mock ok",
    deliveredCount,
    log: `Enviado a ${new Intl.NumberFormat("es-CO").format(deliveredCount)} usuarios${
      imageUrl ? " con imagen" : ""
    }`,
  };
}

function buildImageCaption(message: string) {
  if (message.length <= MAX_ULTRAMSG_IMAGE_CAPTION_LENGTH) {
    return {
      caption: message,
      shouldSendFullTextAfterImage: false,
    };
  }

  return {
    caption: `${message.slice(0, MAX_ULTRAMSG_IMAGE_CAPTION_LENGTH - 3)}...`,
    shouldSendFullTextAfterImage: true,
  };
}

async function sendMessageUltraMsg({
  message,
  segment,
  scheduledAt,
  mode,
  to,
  imageUrl,
}: SendMessageInput): Promise<SendMessageResult> {
  const targetName = segment?.name ?? "Cobertura general";
  const recipients = resolveRecipients(to || segment?.recipientPhones?.join(",") || null);

  if (!recipients.length) {
    console.warn("[announcements] no recipients", {
      mode,
      segment: targetName,
    });
    throw new Error("Sin destinatarios: configura telefonos en el segmento o ULTRAMSG_DEFAULT_TO.");
  }

  const responses: unknown[] = [];
  const failures: string[] = [];
  const imageFallbacks: string[] = [];
  const dryRun = isWhatsAppDryRunMode();
  const hasImage = Boolean(imageUrl?.trim());
  const imageCaption = buildImageCaption(message);

  if (!dryRun) {
    assertRealMassMessagePolicy({ segment, to, recipients });
  }

  if (dryRun) {
    console.log("[announcements] dry-run simulated", {
      mode,
      recipients: recipients.length,
      segment: targetName,
    });
  }

  for (const recipient of recipients) {
    try {
      if (!dryRun) {
        console.log("[announcements] ultramsg sending", {
          mode,
          to: maskRecipient(recipient),
          segment: targetName,
        });
      }

      if (hasImage) {
        const parsedImageBody = await sendWhatsAppImage({
          to: recipient,
          imageUrl,
          caption: imageCaption.caption,
          inboundReply: false,
        });

        if (imageCaption.shouldSendFullTextAfterImage) {
          try {
            await sendWhatsAppText({
              to: recipient,
              message,
              inboundReply: false,
            });
          } catch (error) {
            console.error("[announcements] ultramsg long caption fallback failed", {
              mode,
              scheduledAt: scheduledAt.toISOString(),
              segment: targetName,
              to: maskRecipient(recipient),
              error: error instanceof Error ? error.message : "unknown_error",
            });
          }
        }

        responses.push({
          to: recipient,
          type: "image",
          body: parsedImageBody,
        });

        continue;
      }

      const parsedBody = await sendWhatsAppText({
        to: recipient,
        message,
        inboundReply: false,
      });

      responses.push({
        to: recipient,
        type: "text",
        body: parsedBody,
      });
    } catch (error) {
      if (hasImage) {
        console.error("[announcements] ultramsg image failed", {
          mode,
          scheduledAt: scheduledAt.toISOString(),
          segment: targetName,
          to: maskRecipient(recipient),
          error: error instanceof Error ? error.message : "unknown_error",
        });

        try {
          const fallbackBody = await sendWhatsAppText({
            to: recipient,
            message,
            inboundReply: false,
          });

          imageFallbacks.push(recipient);
          responses.push({
            to: recipient,
            type: "text_fallback",
            body: fallbackBody,
          });

          continue;
        } catch (fallbackError) {
          console.error("[announcements] ultramsg image fallback failed", {
            mode,
            scheduledAt: scheduledAt.toISOString(),
            segment: targetName,
            to: maskRecipient(recipient),
            error: fallbackError instanceof Error ? fallbackError.message : "unknown_error",
          });
        }
      }

      console.error("[messageService] error UltraMsg", {
        mode,
        scheduledAt: scheduledAt.toISOString(),
        segment: targetName,
        to: maskRecipient(recipient),
        error: error instanceof Error ? error.message : "unknown_error",
      });

      failures.push(recipient);
    }
  }

  if (!responses.length) {
    throw new Error(
      failures.length
        ? `UltraMsg no pudo enviar a ningun destinatario: ${failures.join(", ")}.`
        : "UltraMsg no pudo enviar el mensaje.",
    );
  }

  console.log("[messageService] envio UltraMsg ejecutado", {
    mode,
    scheduledAt: scheduledAt.toISOString(),
    segment: targetName,
    to: recipients,
    body: responses,
    failures,
  });

  return {
    sent: !dryRun,
    simulated: dryRun,
    provider: "ultramsg",
    type: hasImage
      ? imageFallbacks.length === responses.length
        ? "text_fallback"
        : "image"
      : "text",
    message: dryRun ? "dry-run ok" : "sent real",
    deliveredCount: responses.length,
    log:
      failures.length > 0
        ? `Enviado por UltraMsg a ${responses.length} destinatario(s)${
            hasImage ? " con imagen" : ""
          }. Fallaron: ${failures.join(", ")}`
        : imageFallbacks.length > 0
          ? `Imagen no enviada a ${imageFallbacks.length} destinatario(s); se envio texto de respaldo.`
        : dryRun
          ? `Dry-run UltraMsg OK para ${responses.length} destinatario(s)${
              hasImage ? " con imagen" : ""
            }.`
          : `Enviado por UltraMsg a ${recipients.join(", ")}${hasImage ? " con imagen" : ""}`,
  };
}

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  if (input.mode === "DEMO") {
    return sendMessageMock(input);
  }

  if (isWhatsAppDryRunMode()) {
    return sendMessageUltraMsg(input);
  }

  if (isWhatsAppSafeMode()) {
    console.warn("[announcements] blocked by safe mode", {
      mode: input.mode,
      segment: input.segment?.name ?? "Cobertura general",
    });
    return {
      sent: false,
      simulated: true,
      blockedBySafeMode: true,
      provider: "mock",
      type: input.imageUrl ? "image" : "text",
      message: "blocked_by_safe_mode",
      deliveredCount: 0,
      log: "Bloqueado por modo seguro: WHATSAPP_SAFE_MODE=true impide envios proactivos reales.",
    };
  }

  if (!isUltraMsgConfigured()) {
    const error = getUltraMsgConfigError();
    console.warn("[announcements] failed", {
      mode: input.mode,
      error,
    });
    throw new Error(error);
  }

  return sendMessageUltraMsg(input);
}

export const messageServiceInternals = {
  buildImageCaption,
  canResolveUltraMsgBaseUrl,
  getUltraMsgBaseUrl,
  isUltraMsgConfigured,
  isWhatsAppDryRunMode,
  isWhatsAppSafeMode,
  normalizeRecipient,
  resolveRecipients,
};
