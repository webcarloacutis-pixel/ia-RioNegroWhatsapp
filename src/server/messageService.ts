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

type SafeInboundReservation = {
  allowed: boolean;
  markSent: () => void;
};

const globalForWhatsAppMessages = globalThis as unknown as {
  __rionegroWhatsAppSentInboundIds?: Set<string>;
};

const DEFAULT_AUDIENCE = 1250;
const ULTRAMSG_DEFAULT_TO = process.env.ULTRAMSG_DEFAULT_TO?.trim() ?? "";

function isUltraMsgConfigured() {
  return Boolean(process.env.ULTRAMSG_TOKEN?.trim() && canResolveUltraMsgBaseUrl());
}

function isWhatsAppSafeMode() {
  return process.env.WHATSAPP_SAFE_MODE === "true";
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
  const rawRecipients = (to?.trim() || ULTRAMSG_DEFAULT_TO)
    .split(/[,\n;]/)
    .map((value) => normalizeRecipient(value.trim()))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(rawRecipients));
}

export async function sendWhatsAppText({
  to,
  message,
  inboundReply = false,
  inboundMessageId,
}: WhatsAppTextInput) {
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

export async function sendWhatsAppTextAfterAudioFailure({
  to,
  message,
  inboundMessageId,
}: WhatsAppTextInput) {
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
}: SendMessageInput) {
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
    deliveredCount,
    log: `Enviado a ${new Intl.NumberFormat("es-CO").format(deliveredCount)} usuarios`,
  };
}

async function sendMessageUltraMsg({
  message,
  segment,
  scheduledAt,
  mode,
  to,
}: SendMessageInput) {
  const targetName = segment?.name ?? "Cobertura general";
  const recipients = resolveRecipients(to || segment?.recipientPhones?.join(",") || null);

  if (!recipients.length) {
    throw new Error("No hay destinatarios configurados para UltraMsg.");
  }

  const responses: unknown[] = [];
  const failures: string[] = [];

  for (const recipient of recipients) {
    try {
      const parsedBody = await sendWhatsAppText({
        to: recipient,
        message,
        inboundReply: false,
      });

      responses.push({
        to: recipient,
        body: parsedBody,
      });
    } catch (error) {
      console.error("[messageService] error UltraMsg", {
        mode,
        scheduledAt: scheduledAt.toISOString(),
        segment: targetName,
        to: recipient,
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
    deliveredCount: responses.length,
    log:
      failures.length > 0
        ? `Enviado por UltraMsg a ${responses.length} destinatario(s). Fallaron: ${failures.join(", ")}`
        : `Enviado por UltraMsg a ${recipients.join(", ")}`,
  };
}

export async function sendMessage(input: SendMessageInput) {
  if (input.mode === "DEMO") {
    return sendMessageMock(input);
  }

  if (isWhatsAppSafeMode()) {
    console.warn(
      "[messageService] WHATSAPP_SAFE_MODE activo. Se evita envio proactivo y se usa mock como respaldo.",
    );
    return sendMessageMock(input);
  }

  if (!isUltraMsgConfigured()) {
    console.warn(
      "[messageService] UltraMsg no esta configurado. Se usa envio mock como respaldo.",
    );
    return sendMessageMock(input);
  }

  return sendMessageUltraMsg(input);
}

export const messageServiceInternals = {
  canResolveUltraMsgBaseUrl,
  getUltraMsgBaseUrl,
  isUltraMsgConfigured,
  isWhatsAppSafeMode,
  normalizeRecipient,
  resolveRecipients,
};
