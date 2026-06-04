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
  title?: string | null;
  imageUrl?: string | null;
  imageFilename?: string | null;
  imageMimeType?: string | null;
  imageSize?: number | null;
  audioUrl?: string | null;
  audioFilename?: string | null;
  audioMimeType?: string | null;
  audioSize?: number | null;
  audioDuration?: number | null;
};

type SendMessageResult = {
  sent: boolean;
  simulated: boolean;
  blockedBySafeMode?: boolean;
  provider: "ultramsg" | "mock";
  type?: "text" | "image" | "audio" | "mixed" | "text_fallback";
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
  audioBase64?: string;
  audioUrl?: string | null;
  mimeType?: string;
  caption?: string;
  inboundReply?: boolean;
  inboundMessageId?: string;
  announcementId?: string;
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

function redactUltraMsgDetail(value: string) {
  return value
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .replace(/\b\d{8,}\b/g, (match) => maskRecipient(match));
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeBooleanFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "ok", "success", "sent", "queued"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "error", "failed", "failure", "invalid"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function getStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function hasPositiveUltraMsgSignal(record: Record<string, unknown>) {
  const flagKeys = ["sent", "success", "ok", "status", "valid"];

  for (const key of flagKeys) {
    const parsed = normalizeBooleanFlag(record[key]);

    if (parsed === true) {
      return true;
    }
  }

  if (getStringField(record, ["id", "messageId", "message_id", "referenceId", "reference_id"])) {
    return true;
  }

  const message = getStringField(record, ["message", "result", "description"]);

  return Boolean(message && /\b(sent|success|ok|queued)\b/i.test(message));
}

function getUltraMsgFailureReason(data: unknown): string | null {
  if (Array.isArray(data)) {
    const failed: string | undefined = data
      .map(getUltraMsgFailureReason)
      .find((message): message is string => Boolean(message));

    return failed ?? null;
  }

  const record = getRecord(data);

  if (!record) {
    return "respuesta vacia o invalida.";
  }

  const explicitError = getStringField(record, [
    "error",
    "errors",
    "errorMessage",
    "error_message",
    "reason",
  ]);

  if (explicitError) {
    return redactUltraMsgDetail(explicitError);
  }

  for (const key of ["sent", "success", "ok", "status", "valid"]) {
    const parsed = normalizeBooleanFlag(record[key]);

    if (parsed === false) {
      const detail = getStringField(record, ["message", "description", "result"]);
      return redactUltraMsgDetail(detail ?? `${key}=false`);
    }
  }

  const message = getStringField(record, ["message", "description", "result"]);

  if (message && /\b(error|failed|failure|invalid|rejected|not sent|no enviado)\b/i.test(message)) {
    return redactUltraMsgDetail(message);
  }

  return hasPositiveUltraMsgSignal(record) ? null : "UltraMsg no confirmo el envio.";
}

function assertUltraMsgAccepted(data: unknown, type: "text" | "image" | "audio") {
  const failureReason = getUltraMsgFailureReason(data);

  if (failureReason) {
    throw new Error(`UltraMsg rechazo el envio ${type}: ${failureReason}`);
  }
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
  return Boolean(
    input.to?.trim() ||
      input.segment?.recipientPhones?.length ||
      getUltraMsgDefaultTo(),
  );
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
  const responseData = response.data;

  assertUltraMsgAccepted(responseData, "text");

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "text",
  });

  return responseData;
}

export async function sendWhatsAppAudio({
  to,
  audioBase64,
  audioUrl,
  caption,
  inboundReply = false,
  inboundMessageId,
  announcementId,
}: WhatsAppAudioInput) {
  if (!audioUrl && !audioBase64) {
    throw new Error("Falta audioUrl o audioBase64 para enviar audio.");
  }

  if (isWhatsAppDryRunMode()) {
    console.log("[ultramsg] sending audio", {
      to: maskRecipient(to),
      inboundReply,
      announcementId,
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
  const audio = audioUrl ?? audioBase64?.replace(
    /^data:audio\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  const data = qs.stringify({
    token,
    to,
    audio,
    caption,
  });

  console.log("[ultramsg] sending audio", {
    to: maskRecipient(to),
    inboundReply,
    announcementId,
    source: audioUrl ? "url" : "base64",
  });

  const response = await axios({
    method: "post",
    url: `${getUltraMsgBaseUrl()}/messages/audio`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data,
  });
  const responseData = response.data;

  assertUltraMsgAccepted(responseData, "audio");

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "audio",
  });

  return responseData;
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
  const responseData = response.data;

  assertUltraMsgAccepted(responseData, "image");

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "image",
  });

  return responseData;
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
  const responseData = response.data;

  assertUltraMsgAccepted(responseData, "text");

  safeReservation.markSent();

  console.log("[ultramsg] reply sent", {
    to: maskRecipient(to),
    type: "text",
    fallback: "audio_failed",
  });

  return responseData;
}

async function sendMessageMock({
  message,
  segment,
  scheduledAt,
  mode,
  imageUrl,
  audioUrl,
}: SendMessageInput): Promise<SendMessageResult> {
  const deliveredCount = segment?.recipientPhones?.length || segment?.estimatedUsers || DEFAULT_AUDIENCE;
  const targetName = segment?.name ?? "Cobertura general";
  const preview = message.length > 80 ? `${message.slice(0, 80)}...` : message;
  const hasImage = Boolean(imageUrl?.trim());
  const hasAudio = Boolean(audioUrl?.trim());
  const mediaSuffix = formatMediaLogSuffix({ hasImage, hasAudio });

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
    type: resolveMessageType({ hasImage, hasAudio }),
    message: "mock ok",
    deliveredCount,
    log: `Enviado a ${new Intl.NumberFormat("es-CO").format(deliveredCount)} usuarios${mediaSuffix}`,
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

function buildAudioIntroMessage(input: { title?: string | null }) {
  const title = input.title?.trim();
  return title
    ? `Mensaje de la Alcaldia de Rionegro: ${title}`
    : "Mensaje de la Alcaldia de Rionegro.";
}

function resolveMessageType(input: { hasImage: boolean; hasAudio: boolean }) {
  if (input.hasImage && input.hasAudio) return "mixed";
  if (input.hasAudio) return "audio";
  if (input.hasImage) return "image";
  return "text";
}

function formatMediaLogSuffix(input: { hasImage: boolean; hasAudio: boolean }) {
  if (input.hasImage && input.hasAudio) return " con imagen y audio";
  if (input.hasAudio) return " con audio";
  if (input.hasImage) return " con imagen";
  return "";
}

async function sendMessageUltraMsg({
  message,
  segment,
  scheduledAt,
  mode,
  to,
  title,
  imageUrl,
  audioUrl,
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
  const hasAudio = Boolean(audioUrl?.trim());
  const imageCaption = buildImageCaption(message);
  const audioIntro = buildAudioIntroMessage({ title });
  const mediaSuffix = formatMediaLogSuffix({ hasImage, hasAudio });

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
    let sentAudioIntro = false;

    try {
      if (!dryRun) {
        console.log("[announcements] ultramsg sending", {
          mode,
          to: maskRecipient(recipient),
          segment: targetName,
        });
      }

      if (hasAudio) {
        const parsedIntroBody = await sendWhatsAppText({
          to: recipient,
          message: audioIntro,
          inboundReply: false,
        });
        sentAudioIntro = true;

        let parsedImageBody: unknown = null;

        if (hasImage) {
          parsedImageBody = await sendWhatsAppImage({
            to: recipient,
            imageUrl,
            caption: imageCaption.caption,
            inboundReply: false,
          });
        }

        const parsedAudioBody = await sendWhatsAppAudio({
          to: recipient,
          audioUrl,
          inboundReply: false,
        });

        responses.push({
          to: recipient,
          type: resolveMessageType({ hasImage, hasAudio }),
          body: {
            text: parsedIntroBody,
            image: parsedImageBody,
            audio: parsedAudioBody,
          },
        });

        continue;
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
      if (hasAudio) {
        console.error("[announcements] audio announcement failed", {
          mode,
          scheduledAt: scheduledAt.toISOString(),
          segment: targetName,
          to: maskRecipient(recipient),
          error: error instanceof Error ? error.message : "unknown_error",
        });

        if (!sentAudioIntro) {
          try {
            const fallbackBody = await sendWhatsAppText({
              to: recipient,
              message,
              inboundReply: false,
            });

            responses.push({
              to: recipient,
              type: "text_fallback",
              body: fallbackBody,
            });

            continue;
          } catch (fallbackError) {
            console.error("[announcements] audio text fallback failed", {
              mode,
              scheduledAt: scheduledAt.toISOString(),
              segment: targetName,
              to: maskRecipient(recipient),
              error: fallbackError instanceof Error ? fallbackError.message : "unknown_error",
            });
          }
        }

        failures.push(recipient);
        continue;
      }

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
        ? `UltraMsg no pudo enviar a ningun destinatario: ${failures.map(maskRecipient).join(", ")}.`
        : "UltraMsg no pudo enviar el mensaje.",
    );
  }

  console.log("[messageService] envio UltraMsg ejecutado", {
    mode,
    scheduledAt: scheduledAt.toISOString(),
    segment: targetName,
    to: recipients.map(maskRecipient),
    body: responses,
    failures: failures.map(maskRecipient),
  });

  return {
    sent: !dryRun,
    simulated: dryRun,
    provider: "ultramsg",
    type:
      imageFallbacks.length === responses.length && !hasAudio
        ? "text_fallback"
        : resolveMessageType({ hasImage, hasAudio }),
    message: dryRun ? "dry-run ok" : "sent real",
    deliveredCount: responses.length,
    log:
      failures.length > 0
        ? `Enviado por UltraMsg a ${responses.length} destinatario(s)${mediaSuffix}. Fallaron: ${failures.map(maskRecipient).join(", ")}`
        : imageFallbacks.length > 0
          ? `Imagen no enviada a ${imageFallbacks.length} destinatario(s); se envio texto de respaldo.`
        : dryRun
          ? `Dry-run UltraMsg OK para ${responses.length} destinatario(s)${mediaSuffix}.`
          : `Enviado por UltraMsg a ${recipients.map(maskRecipient).join(", ")}${mediaSuffix}`,
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
      type: resolveMessageType({
        hasImage: Boolean(input.imageUrl?.trim()),
        hasAudio: Boolean(input.audioUrl?.trim()),
      }),
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
  getUltraMsgDefaultTo,
  hasExplicitMassMessageRecipients,
  isUltraMsgConfigured,
  isWhatsAppDryRunMode,
  isWhatsAppSafeMode,
  normalizeRecipient,
  resolveRecipients,
};
