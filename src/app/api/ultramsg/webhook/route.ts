import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/errors";
import {
  WEBHOOK_BODY_LIMIT_BYTES,
  assertRequestBodyPolicy,
  readRequestTextWithLimit,
} from "@/lib/request-security";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPublicHttpUrl } from "@/lib/url-security";
import {
  generateElevenLabsSpeech,
  getElevenLabsVoiceForLanguage,
  isElevenLabsConfigured,
} from "@/server/elevenlabs-service";
import {
  determineResponseChannel,
  getInputChannel,
  type EvaInputChannel,
  type EvaResponseChannel,
} from "@/server/eva-channel";
import {
  closePersistentAssistantMemory,
  getConversationClosingReply,
  isConversationClosingMessage,
  resetPersistentAssistantMemory,
} from "@/server/assistant-memory-service";
import { ensureCitizenSegmentMembership } from "@/server/citizen-segmentation-service";
import { detectUserLanguage, type SupportedLanguage } from "@/lib/language";
import {
  sendWhatsAppAudio,
  sendWhatsAppText,
  sendWhatsAppTextAfterAudioFailure,
} from "@/server/messageService";
import { isOpenAIConfigured, transcribeAudio } from "@/server/openai-service";
import { chatWithAssistant, resetConversation } from "@/server/rionegro-assistant";
import {
  detectCitizenReportIntent,
  handleCitizenReport,
} from "@/server/citizen-report-service";
import { analyzeUserMessageIntent } from "@/server/intent-classifier";

export const runtime = "nodejs";

type UltraMsgMessageData = {
  id?: string;
  from?: string;
  to?: string;
  body?: string;
  caption?: string;
  type?: string;
  mimetype?: string;
  mimeType?: string;
  filename?: string;
  fromMe?: boolean;
  time?: number;
} & Record<string, unknown>;

type UltraMsgWebhookPayload = {
  event_type?: string;
  instanceId?: string;
  data?: UltraMsgMessageData;
} & Record<string, unknown>;

type IgnoreResult = {
  ignored: boolean;
  reason?: string;
};

type MediaSource = {
  value: string;
  kind: "url" | "data-uri" | "base64";
  mimeType?: string;
  filename?: string;
};

type DownloadedMedia = {
  bytes: Buffer;
  mimeType: string;
  filename: string;
};

const SUPPORTED_MESSAGE_TYPES = new Set([
  "chat",
  "audio",
  "ptt",
  "voice",
  "image",
  "document",
]);
const AUDIO_MESSAGE_TYPES = new Set(["audio", "ptt", "voice"]);
const IMAGE_MESSAGE_TYPES = new Set(["image"]);
const MEDIA_SOURCE_KEYS = [
  "media",
  "mediaUrl",
  "media_url",
  "downloadUrl",
  "download_url",
  "url",
  "file",
  "image",
  "audio",
  "body",
];
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MESSAGES = 20;
const WEBHOOK_IP_RATE_LIMIT = {
  limit: 60,
  windowMs: 60_000,
};
const MAX_MEDIA_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_REPORT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const ASSISTANT_FALLBACK_REPLY =
  "Recibí tu mensaje, pero en este momento no pude consultar toda la información. Por favor intenta de nuevo en unos minutos o escríbenos por los canales oficiales de la Alcaldía de Rionegro.";

const globalForWebhook = globalThis as unknown as {
  __rionegroWhatsAppInboundIds?: Set<string>;
  __rionegroWhatsAppRateLimit?: Map<
    string,
    {
      count: number;
      resetAt: number;
    }
  >;
};

function getInboundIds() {
  if (!globalForWebhook.__rionegroWhatsAppInboundIds) {
    globalForWebhook.__rionegroWhatsAppInboundIds = new Set<string>();
  }

  return globalForWebhook.__rionegroWhatsAppInboundIds;
}

function getRateLimitMap() {
  if (!globalForWebhook.__rionegroWhatsAppRateLimit) {
    globalForWebhook.__rionegroWhatsAppRateLimit = new Map();
  }

  return globalForWebhook.__rionegroWhatsAppRateLimit;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeCompareSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getProvidedWebhookSecret(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  const headerSecret =
    request.headers.get("x-ultramsg-webhook-secret") ??
    request.headers.get("x-webhook-secret");

  if (headerSecret?.trim()) {
    return headerSecret.trim();
  }

  try {
    const url = new URL(request.url);
    return (
      url.searchParams.get("secret") ??
      url.searchParams.get("webhook_secret") ??
      url.searchParams.get("token") ??
      ""
    ).trim();
  } catch {
    return "";
  }
}

function isWebhookSecretAllowed(request: Request) {
  const expected = process.env.ULTRAMSG_WEBHOOK_SECRET?.trim();

  if (!expected) {
    return true;
  }

  const provided = getProvidedWebhookSecret(request);

  return Boolean(provided) && safeCompareSecret(provided, expected);
}

function coerceWebhookPayload(value: unknown): UltraMsgWebhookPayload {
  if (!isPlainObject(value)) {
    return {};
  }

  const dataValue = value.data;
  const data =
    typeof dataValue === "string"
      ? (parseJsonObject(dataValue) as UltraMsgMessageData)
      : isPlainObject(dataValue)
        ? (dataValue as UltraMsgMessageData)
        : undefined;

  if (data) {
    return {
      ...value,
      data,
    } as UltraMsgWebhookPayload;
  }

  if ("from" in value || "body" in value || "type" in value) {
    return {
      event_type: typeof value.event_type === "string" ? value.event_type : undefined,
      instanceId: typeof value.instanceId === "string" ? value.instanceId : undefined,
      data: value as UltraMsgMessageData,
    };
  }

  return value as UltraMsgWebhookPayload;
}

function formValue(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);

    if (value !== null) {
      return value;
    }
  }

  return undefined;
}

async function parseWebhookPayload(request: Request): Promise<UltraMsgWebhookPayload> {
  assertRequestBodyPolicy(request, {
    allowedContentTypes: [
      "application/json",
      "application/x-www-form-urlencoded",
      "text/plain",
    ],
    allowMissingContentType: true,
    maxBytes: WEBHOOK_BODY_LIMIT_BYTES,
  });

  const contentType = request.headers.get("content-type") ?? "";
  const rawText = await readRequestTextWithLimit(request, WEBHOOK_BODY_LIMIT_BYTES);

  if (contentType.includes("application/json")) {
    try {
      return coerceWebhookPayload(JSON.parse(rawText));
    } catch {
      return {};
    }
  }

  if (!rawText.trim()) {
    return {};
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(rawText);
    const rawData = formValue(form, "data");

    if (rawData) {
      return coerceWebhookPayload(parseJsonObject(rawData));
    }

    return {
      event_type: formValue(form, "event_type"),
      instanceId: formValue(form, "instanceId", "instance_id"),
      data: {
        id: formValue(form, "id", "data.id", "data[id]"),
        from: formValue(form, "from", "data.from", "data[from]"),
        to: formValue(form, "to", "data.to", "data[to]"),
        body: formValue(form, "body", "data.body", "data[body]"),
        caption: formValue(form, "caption", "data.caption", "data[caption]"),
        type: formValue(form, "type", "data.type", "data[type]"),
        mimetype: formValue(form, "mimetype", "data.mimetype", "data[mimetype]"),
        mimeType: formValue(form, "mimeType", "data.mimeType", "data[mimeType]"),
        filename: formValue(form, "filename", "data.filename", "data[filename]"),
        fromMe:
          formValue(form, "fromMe", "data.fromMe", "data[fromMe]")?.toLowerCase() ===
          "true",
      },
    };
  }

  return coerceWebhookPayload(parseJsonObject(rawText));
}

function getMessageType(payload: UltraMsgWebhookPayload) {
  const data = payload.data;
  const explicitType = String(data?.type ?? "")
    .trim()
    .toLowerCase();

  if (explicitType) {
    return explicitType;
  }

  const mimeType = String(data?.mimetype ?? data?.mimeType ?? "").toLowerCase();

  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType) return "document";
  if (data?.body || data?.caption) return "chat";

  return "";
}

function isAudioMessageType(type: string) {
  return AUDIO_MESSAGE_TYPES.has(type);
}

function isImageMessageType(type: string) {
  return IMAGE_MESSAGE_TYPES.has(type);
}

function getIncomingText(payload: UltraMsgWebhookPayload) {
  const data = payload.data;
  const type = getMessageType(payload);
  const caption = typeof data?.caption === "string" ? data.caption.trim() : "";
  const body = typeof data?.body === "string" ? data.body.trim() : "";

  if (type === "chat") {
    return caption || body;
  }

  if (isAudioMessageType(type)) {
    return caption;
  }

  if (caption) {
    return caption;
  }

  if (looksLikeUrl(body) || looksLikeDataUri(body) || looksLikeBase64(body)) {
    return "";
  }

  return caption || body;
}

function isIncomingMessageEvent(payload: UltraMsgWebhookPayload) {
  const eventType = payload.event_type?.trim().toLowerCase();

  if (!eventType) {
    return true;
  }

  if (
    eventType.includes("ack") ||
    eventType.includes("reaction") ||
    eventType.includes("create")
  ) {
    return false;
  }

  return (
    eventType === "message_received" ||
    eventType === "message" ||
    eventType === "messages" ||
    eventType === "incoming" ||
    eventType.includes("received")
  );
}

function shouldIgnoreMessage(payload: UltraMsgWebhookPayload): IgnoreResult {
  const data = payload.data;
  const type = getMessageType(payload);
  const incomingText = getIncomingText(payload);

  if (!isIncomingMessageEvent(payload)) {
    return { ignored: true, reason: "unsupported_event" };
  }

  if (!data) {
    return { ignored: true, reason: "missing_data" };
  }

  if (data.fromMe) {
    return { ignored: true, reason: "from_me" };
  }

  if (
    (typeof data.from === "string" && data.from.toLowerCase().includes("@g.us")) ||
    (typeof data.to === "string" && data.to.toLowerCase().includes("@g.us"))
  ) {
    return { ignored: true, reason: "group_message" };
  }

  if (!SUPPORTED_MESSAGE_TYPES.has(type)) {
    return { ignored: true, reason: "unsupported_type" };
  }

  if (!isAudioMessageType(type) && !isImageMessageType(type) && !incomingText) {
    return { ignored: true, reason: "empty_message" };
  }

  if (process.env.WHATSAPP_SAFE_MODE === "true" && !data.id) {
    return { ignored: true, reason: "missing_message_id" };
  }

  return { ignored: false };
}

function extractPhoneNumber(chatId?: string) {
  if (!chatId) {
    return null;
  }

  const normalizedChatId = chatId.trim().toLowerCase();

  if (!normalizedChatId || normalizedChatId.includes("@g.us")) {
    return null;
  }

  const digits = normalizedChatId.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function maskRecipient(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `****${digits.slice(-4)}`;
}

function buildSessionId(phoneNumber: string) {
  return `whatsapp:${phoneNumber}`;
}

function isResetCommand(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return ["reset", "reiniciar", "restart", "nuevo chat"].includes(normalized);
}

function isDuplicateInboundMessage(messageId?: string) {
  if (!messageId) {
    return false;
  }

  const inboundIds = getInboundIds();

  if (inboundIds.has(messageId)) {
    console.log("[whatsapp] skipped duplicate", {
      messageId,
      scope: "inbound_webhook",
    });

    return true;
  }

  inboundIds.add(messageId);

  if (inboundIds.size > 1000) {
    const oldest = inboundIds.values().next().value;

    if (oldest) {
      inboundIds.delete(oldest);
    }
  }

  return false;
}

function isRateLimitAllowed(recipient: string) {
  const now = Date.now();
  const rateLimitMap = getRateLimitMap();
  const current = rateLimitMap.get(recipient);

  if (!current || current.resetAt <= now) {
    rateLimitMap.set(recipient, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_MESSAGES) {
    console.warn("[whatsapp] rate limit reached", {
      from: maskRecipient(recipient),
    });
    return false;
  }

  current.count += 1;
  return true;
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function looksLikeDataUri(value: string) {
  return /^data:[^;]+;base64,/i.test(value);
}

function looksLikeBase64(value: string) {
  const cleaned = value.replace(/\s+/g, "");
  return cleaned.length > 32 && /^[a-zA-Z0-9+/]+={0,2}$/.test(cleaned);
}

function readStringCandidate(value: unknown, depth = 0): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!isPlainObject(value) || depth > 2) {
    return null;
  }

  for (const key of MEDIA_SOURCE_KEYS) {
    const nested = readStringCandidate(value[key], depth + 1);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function classifyMediaSource(
  value: string,
  data: UltraMsgMessageData,
): MediaSource | null {
  const mimeType =
    typeof data.mimetype === "string"
      ? data.mimetype
      : typeof data.mimeType === "string"
        ? data.mimeType
        : undefined;
  const filename = typeof data.filename === "string" ? data.filename : undefined;

  if (looksLikeUrl(value)) {
    return {
      value,
      kind: "url",
      mimeType,
      filename,
    };
  }

  if (looksLikeDataUri(value)) {
    return {
      value,
      kind: "data-uri",
      mimeType,
      filename,
    };
  }

  if (looksLikeBase64(value)) {
    return {
      value,
      kind: "base64",
      mimeType,
      filename,
    };
  }

  return null;
}

function extractMediaSource(payload: UltraMsgWebhookPayload): MediaSource | null {
  const data = payload.data;

  if (!data) {
    return null;
  }

  for (const key of MEDIA_SOURCE_KEYS) {
    const candidate = readStringCandidate(data[key]);

    if (!candidate) {
      continue;
    }

    const mediaSource = classifyMediaSource(candidate, data);

    if (mediaSource) {
      return mediaSource;
    }
  }

  return null;
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg") || mimeType.includes("opus")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

function inferMimeTypeFromUrl(value: string) {
  const pathname = (() => {
    try {
      return new URL(value).pathname.toLowerCase();
    } catch {
      return value.toLowerCase();
    }
  })();

  if (pathname.endsWith(".mp3")) return "audio/mpeg";
  if (pathname.endsWith(".wav")) return "audio/wav";
  if (pathname.endsWith(".m4a") || pathname.endsWith(".mp4")) return "audio/mp4";
  if (pathname.endsWith(".webm")) return "audio/webm";
  return "audio/ogg";
}

function getFilenameFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const filename = pathname.split("/").filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename) : null;
  } catch {
    return null;
  }
}

function sanitizeFilename(value: string, mimeType: string) {
  const cleaned = value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  const extension = extensionFromMimeType(mimeType);

  if (!cleaned) {
    return `nota-voz.${extension}`;
  }

  return /\.[a-z0-9]+$/i.test(cleaned) ? cleaned : `${cleaned}.${extension}`;
}

function isReportImageAttachmentAllowed(url: string, mimeType?: string) {
  if (!isPublicHttpUrl(url)) {
    return false;
  }

  const normalizedMimeType = mimeType?.split(";")[0]?.trim().toLowerCase();

  if (normalizedMimeType) {
    return ALLOWED_REPORT_IMAGE_MIME_TYPES.has(normalizedMimeType);
  }

  return /\.(jpe?g|png|webp)(?:\?|$)/i.test(url);
}

async function downloadMedia(mediaSource: MediaSource): Promise<DownloadedMedia> {
  if (mediaSource.kind === "url") {
    if (!isPublicHttpUrl(mediaSource.value)) {
      throw new Error("URL de medio no permitida.");
    }

    const response = await fetch(mediaSource.value);

    if (!response.ok) {
      throw new Error(`No se pudo descargar el medio (${response.status}).`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_DOWNLOAD_BYTES) {
      throw new Error("El medio excede el tamano permitido.");
    }

    const responseMimeType = response.headers.get("content-type")?.split(";")[0];
    const mimeType =
      mediaSource.mimeType || responseMimeType || inferMimeTypeFromUrl(mediaSource.value);
    const filename = sanitizeFilename(
      mediaSource.filename || getFilenameFromUrl(mediaSource.value) || "nota-voz",
      mimeType,
    );
    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) {
      throw new Error("El medio excede el tamano permitido.");
    }

    return {
      bytes,
      mimeType,
      filename,
    };
  }

  if (mediaSource.kind === "data-uri") {
    const match = mediaSource.value.match(/^data:([^;]+);base64,(.+)$/i);

    if (!match) {
      throw new Error("Data URI de audio invalido.");
    }

    const mimeType = mediaSource.mimeType || match[1] || "audio/ogg";

    const bytes = Buffer.from(match[2], "base64");

    if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) {
      throw new Error("El medio excede el tamano permitido.");
    }

    return {
      bytes,
      mimeType,
      filename: sanitizeFilename(mediaSource.filename || "nota-voz", mimeType),
    };
  }

  const mimeType = mediaSource.mimeType || "audio/ogg";
  const bytes = Buffer.from(mediaSource.value.replace(/\s+/g, ""), "base64");

  if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) {
    throw new Error("El medio excede el tamano permitido.");
  }

  return {
    bytes,
    mimeType,
    filename: sanitizeFilename(mediaSource.filename || "nota-voz", mimeType),
  };
}

async function sendAssistantReply({
  recipient,
  reply,
  inboundMessageId,
  language = "es",
  inputChannel = "text",
  responseChannel = "text",
}: {
  recipient: string;
  reply: string;
  inboundMessageId?: string;
  language?: SupportedLanguage;
  inputChannel?: EvaInputChannel;
  responseChannel?: EvaResponseChannel;
}) {
  const audioEnabled = process.env.WHATSAPP_AUDIO_REPLIES !== "false";

  console.log(`[eva-channel] input=${inputChannel} response=${responseChannel}`, {
    inputChannel,
    responseChannel,
    language,
  });

  if (responseChannel === "audio" && audioEnabled && isElevenLabsConfigured(language)) {
    try {
      const voiceId = getElevenLabsVoiceForLanguage(language);
      const voice = language === "en" ? "english" : "spanish";
      console.log(`[eva-channel] language=${language} response=audio voice=${voice}`, {
        language,
        voice,
        voiceId,
      });
      console.log("[eva] elevenlabs voice selected", {
        language,
        voiceId,
      });
      const speech = await generateElevenLabsSpeech(reply, { language });

      await sendWhatsAppAudio({
        to: recipient,
        audioBase64: speech.audioBase64,
        mimeType: speech.mimeType,
        caption: reply,
        inboundReply: true,
        inboundMessageId,
      });

      if (
        process.env.WHATSAPP_SEND_TEXT_WITH_AUDIO === "true" &&
        process.env.WHATSAPP_SAFE_MODE !== "true"
      ) {
        await sendWhatsAppText({
          to: recipient,
          message: reply,
          inboundReply: true,
          inboundMessageId,
        });
      }

      return { audio: true, text: false, inputChannel, responseChannel };
    } catch (error) {
      console.warn("[elevenlabs] error generating audio, falling back to text", {
        error: error instanceof Error ? error.message : "unknown_error",
      });

      try {
        await sendWhatsAppTextAfterAudioFailure({
          to: recipient,
          message: reply,
          inboundReply: true,
          inboundMessageId,
        });

        return {
          audio: false,
          text: true,
          fallback: "audio_failed",
          inputChannel,
          responseChannel: "text" as const,
        };
      } catch (textError) {
        console.error("[ultramsg] text fallback failed", {
          error: textError instanceof Error ? textError.message : "unknown_error",
        });

        return { audio: false, text: false, error: "send_failed", inputChannel, responseChannel };
      }
    }
  }

  if (responseChannel === "audio") {
    console.warn("[eva-channel] audio fallback to text", {
      inputChannel,
      language,
      audioEnabled,
      elevenLabsConfigured: isElevenLabsConfigured(language),
    });
  }

  try {
    await sendWhatsAppText({
      to: recipient,
      message: reply,
      inboundReply: true,
      inboundMessageId,
    });
  } catch (error) {
    console.error("[ultramsg] text send failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return { audio: false, text: false, error: "send_failed", inputChannel, responseChannel };
  }

  return { audio: false, text: true, inputChannel, responseChannel: "text" as const };
}

async function getAssistantReplySafely(sessionId: string, message: string) {
  try {
    const result = await chatWithAssistant(sessionId, message);

    console.log("[assistant] reply generated", {
      chars: result.reply.length,
      usedOpenAI: result.meta.usedOpenAI,
      language: result.meta.language,
    });

    return {
      reply: result.reply,
      language: result.meta.language,
    };
  } catch (error) {
    console.error("[assistant] reply fallback", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return {
      reply: ASSISTANT_FALLBACK_REPLY,
      language: "es" as const,
    };
  }
}

async function processTextMessage(input: {
  incomingText: string;
  recipient: string;
  sessionId: string;
  inboundMessageId?: string;
  inputChannel: EvaInputChannel;
  responseChannel: EvaResponseChannel;
}) {
  if (isResetCommand(input.incomingText)) {
    resetConversation(input.sessionId);
    await resetPersistentAssistantMemory(input.sessionId);

    return sendAssistantReply({
      recipient: input.recipient,
      reply:
        "Conversacion reiniciada. Puedes hacer una nueva consulta sobre Rionegro cuando quieras.",
      inboundMessageId: input.inboundMessageId,
      language: "es",
      inputChannel: input.inputChannel,
      responseChannel: input.responseChannel,
    });
  }

  if (isConversationClosingMessage(input.incomingText)) {
    const language = detectUserLanguage({ text: input.incomingText }).language;
    await closePersistentAssistantMemory(input.sessionId, "user_closed");

    return sendAssistantReply({
      recipient: input.recipient,
      reply: getConversationClosingReply(language),
      inboundMessageId: input.inboundMessageId,
      language,
      inputChannel: input.inputChannel,
      responseChannel: input.responseChannel,
    });
  }

  const assistantReply = await getAssistantReplySafely(input.sessionId, input.incomingText);

  return sendAssistantReply({
    recipient: input.recipient,
    reply: assistantReply.reply,
    inboundMessageId: input.inboundMessageId,
    language: assistantReply.language,
    inputChannel: input.inputChannel,
    responseChannel: input.responseChannel,
  });
}

function getImageAttachment(payload: UltraMsgWebhookPayload) {
  const mediaSource = extractMediaSource(payload);

  if (!mediaSource) {
    return null;
  }

  if (mediaSource.kind !== "url") {
    console.log("[citizen-reports] image received", {
      stored: false,
      reason: "no_persistent_url",
    });
    return null;
  }

  const data = payload.data;
  const mimeType =
    typeof data?.mimetype === "string"
      ? data.mimetype
      : typeof data?.mimeType === "string"
        ? data.mimeType
        : undefined;

  if (!isReportImageAttachmentAllowed(mediaSource.value, mimeType)) {
    console.log("[citizen-reports] image received", {
      stored: false,
      reason: "image_not_allowed",
    });
    return null;
  }

  console.log("[citizen-reports] image received", {
    stored: true,
    mimeType,
  });

  return {
    url: mediaSource.value,
    filename:
      typeof data?.filename === "string"
        ? data.filename
        : getFilenameFromUrl(mediaSource.value) ?? undefined,
    mimeType,
  };
}

async function processCitizenReportMessage(input: {
  payload: UltraMsgWebhookPayload;
  type: string;
  incomingText: string;
  recipient: string;
  inboundMessageId?: string;
  inputChannel: EvaInputChannel;
  responseChannel: EvaResponseChannel;
}) {
  const hasImage = isImageMessageType(input.type);
  const image = hasImage ? getImageAttachment(input.payload) : null;
  const data = input.payload.data;
  const description = input.incomingText.trim();
  const language = detectUserLanguage({ text: description }).language;
  const intentAnalysis = analyzeUserMessageIntent(description, {
    messageType: input.type,
    hasImage,
  });
  const reportIntent = detectCitizenReportIntent(description, input.type);

  if (!intentAnalysis.shouldCreateCitizenReport && !(hasImage && !description)) {
    console.log("[citizen-reports] routed to general assistant", {
      type: input.type,
      reporter: maskRecipient(input.recipient),
      intent: intentAnalysis.intent,
      reason: intentAnalysis.reason,
    });
    return null;
  }

  console.log("[citizen-reports] report flow activated", {
    type: input.type,
    reporter: maskRecipient(input.recipient),
    intent: intentAnalysis.intent,
    category: reportIntent.category,
    priority: reportIntent.priority,
  });

  const result = await handleCitizenReport({
    text: description,
    messageType: input.type,
    recipient: input.recipient,
    whatsappMessageId: input.inboundMessageId,
    whatsappFrom: data?.from,
    whatsappRawType: input.type,
    images: image ? [image] : [],
    hasImage,
    reportIntent,
    language,
  });

  if (!result.handled) {
    console.log("[citizen-reports] routed to general assistant", {
      type: input.type,
      reporter: maskRecipient(input.recipient),
    });
    return null;
  }

  const replyStatus = await sendAssistantReply({
    recipient: input.recipient,
    reply: result.reply,
    inboundMessageId: input.inboundMessageId,
    language,
    inputChannel: input.inputChannel,
    responseChannel: input.responseChannel,
  });

  console.log("[citizen-reports] confirmation sent", {
    type: input.type,
    category: result.report?.category,
    priority: result.report?.priority,
    needsMoreInfo: Boolean(result.needsMoreInfo),
  });

  return {
    ...replyStatus,
    handledAs: "citizen_report",
  };
}

async function processAudioMessage(input: {
  payload: UltraMsgWebhookPayload;
  recipient: string;
  sessionId: string;
  inboundMessageId?: string;
  inputChannel: EvaInputChannel;
  responseChannel: EvaResponseChannel;
}) {
  console.log("[whatsapp] inbound audio", {
    from: maskRecipient(input.recipient),
    messageId: input.inboundMessageId,
  });

  const mediaSource = extractMediaSource(input.payload);

  if (!mediaSource) {
    return sendAssistantReply({
      recipient: input.recipient,
      reply:
        "No pude descargar la nota de voz. Por favor envíame el mensaje escrito o revisa que UltraMsg tenga activo Webhook Download Media.",
      inboundMessageId: input.inboundMessageId,
      language: "es",
      inputChannel: input.inputChannel,
      responseChannel: "text",
    });
  }

  if (!isOpenAIConfigured()) {
    return sendAssistantReply({
      recipient: input.recipient,
      reply:
        "No pude transcribir la nota de voz en este momento. Por favor envíame el mensaje escrito.",
      inboundMessageId: input.inboundMessageId,
      language: "es",
      inputChannel: input.inputChannel,
      responseChannel: "text",
    });
  }

  let media: DownloadedMedia;

  try {
    media = await downloadMedia(mediaSource);
  } catch (error) {
    console.warn("[whatsapp] audio download failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return sendAssistantReply({
      recipient: input.recipient,
      reply:
        "No pude descargar la nota de voz. Por favor envíame el mensaje escrito o revisa que UltraMsg tenga activo Webhook Download Media.",
      inboundMessageId: input.inboundMessageId,
      language: "es",
      inputChannel: input.inputChannel,
      responseChannel: "text",
    });
  }

  console.log("[transcription] started", {
    bytes: media.bytes.byteLength,
    mimeType: media.mimeType,
  });

  let transcription = "";

  try {
    transcription = await transcribeAudio({
      audio: media.bytes,
      filename: media.filename,
      mimeType: media.mimeType,
      language: process.env.WHATSAPP_TRANSCRIPTION_LANGUAGE?.trim() || undefined,
    });
  } catch (error) {
    console.error("[transcription] error", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return sendAssistantReply({
      recipient: input.recipient,
      reply:
        "Recibí tu nota de voz, pero no pude transcribirla en este momento. Por favor envíame el mensaje escrito.",
      inboundMessageId: input.inboundMessageId,
      language: "es",
      inputChannel: input.inputChannel,
      responseChannel: "text",
    });
  }

  console.log("[transcription] result", {
    chars: transcription.length,
  });

  if (!transcription) {
    return sendAssistantReply({
      recipient: input.recipient,
      reply:
        "No pude entender la nota de voz. Por favor intenta enviarla de nuevo o escríbeme el mensaje.",
      inboundMessageId: input.inboundMessageId,
      language: "es",
      inputChannel: input.inputChannel,
      responseChannel: "text",
    });
  }

  if (isConversationClosingMessage(transcription)) {
    const language = detectUserLanguage({ text: transcription }).language;
    await closePersistentAssistantMemory(input.sessionId, "user_closed");

    return sendAssistantReply({
      recipient: input.recipient,
      reply: getConversationClosingReply(language),
      inboundMessageId: input.inboundMessageId,
      language,
      inputChannel: input.inputChannel,
      responseChannel: input.responseChannel,
    });
  }

  const citizenReportReply = await processCitizenReportMessage({
    payload: input.payload,
    type: "audio",
    incomingText: transcription,
    recipient: input.recipient,
    inboundMessageId: input.inboundMessageId,
    inputChannel: input.inputChannel,
    responseChannel: input.responseChannel,
  });

  if (citizenReportReply) {
    return citizenReportReply;
  }

  const assistantReply = await getAssistantReplySafely(input.sessionId, transcription);

  return sendAssistantReply({
    recipient: input.recipient,
    reply: assistantReply.reply,
    inboundMessageId: input.inboundMessageId,
    language: assistantReply.language,
    inputChannel: input.inputChannel,
    responseChannel: input.responseChannel,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ultramsg-webhook",
    postUrl: "/api/webhook",
    acceptedContentTypes: [
      "application/json",
      "application/x-www-form-urlencoded",
      "text/plain",
    ],
  });
}

export async function POST(request: Request) {
  try {
    if (!isWebhookSecretAllowed(request)) {
      console.warn("[security] ultramsg webhook rejected: invalid secret");

      return NextResponse.json(
        {
          ok: false,
          error: "Webhook no autorizado.",
        },
        { status: 401 },
      );
    }

    const clientIp = getClientIp(request);
    const ipRateLimit = checkRateLimit(`ultramsg-webhook:${clientIp}`, WEBHOOK_IP_RATE_LIMIT);

    if (!ipRateLimit.allowed) {
      console.warn("[security] ultramsg webhook IP rate limited", {
        ip: clientIp,
        retryAfterMs: ipRateLimit.retryAfterMs,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Demasiadas solicitudes.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(ipRateLimit.retryAfterMs / 1000)),
          },
        },
      );
    }

    console.log("[whatsapp] webhook received", {
      contentType: request.headers.get("content-type") ?? "unknown",
    });

    const payload = await parseWebhookPayload(request);
    const ignoreResult = shouldIgnoreMessage(payload);

    if (ignoreResult.ignored) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: ignoreResult.reason,
      });
    }

    const data = payload.data as UltraMsgMessageData;
    const type = getMessageType(payload);
    const inboundMessageId = data.id;

    if (isDuplicateInboundMessage(inboundMessageId)) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "duplicate",
      });
    }

    const recipient = extractPhoneNumber(data.from);

    if (!recipient) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "invalid_sender",
      });
    }

    const incomingText = getIncomingText(payload);
    const segmentationLanguage = incomingText.trim()
      ? detectUserLanguage({ text: incomingText }).language
      : null;
    await ensureCitizenSegmentMembership({
      phoneNumber: recipient,
      source: "whatsapp",
      messageType: type,
      language: segmentationLanguage,
      metadata: {
        provider: "ultramsg",
        inboundMessageId,
      },
    });

    if (!isRateLimitAllowed(recipient)) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "rate_limit",
      });
    }

    const sessionId = buildSessionId(recipient);

    console.log("[whatsapp] inbound message", {
      from: maskRecipient(recipient),
      type,
      messageId: inboundMessageId,
    });

    if (isAudioMessageType(type)) {
      console.log("[whatsapp] inbound audio", {
        from: maskRecipient(recipient),
        messageId: inboundMessageId,
      });
    } else if (isImageMessageType(type)) {
      console.log("[whatsapp] inbound image", {
        from: maskRecipient(recipient),
        messageId: inboundMessageId,
      });
    } else {
      console.log("[whatsapp] inbound text", {
        from: maskRecipient(recipient),
        messageId: inboundMessageId,
      });
    }

    const hasAudio = isAudioMessageType(type);
    const hasImage = isImageMessageType(type);
    const hasText = Boolean(incomingText.trim());
    const inputChannel = getInputChannel({
      incomingMessageType: type,
      hasAudio,
      hasImage,
      hasText,
    });
    const responseChannel = determineResponseChannel({
      incomingMessageType: type,
      hasAudio,
      hasImage,
      hasText,
    });
    console.log(`[eva-channel] input=${inputChannel} response=${responseChannel}`, {
      type,
      hasText,
      hasAudio,
      hasImage,
    });
    const citizenReportReply = isAudioMessageType(type)
      ? null
      : await processCitizenReportMessage({
          payload,
          type,
          incomingText,
          recipient,
          inboundMessageId,
          inputChannel,
          responseChannel,
        });
    const replyStatus =
      citizenReportReply ??
      (isAudioMessageType(type)
        ? await processAudioMessage({
            payload,
            recipient,
            sessionId,
            inboundMessageId,
            inputChannel,
            responseChannel,
          })
        : await processTextMessage({
            incomingText,
            recipient,
            sessionId,
            inboundMessageId,
            inputChannel,
            responseChannel,
          }));

    return NextResponse.json({
      ok: true,
      sent: true,
      to: maskRecipient(recipient),
      reply: replyStatus,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: error.status },
      );
    }

    console.error("[whatsapp] webhook error", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json({
      ok: true,
      accepted: true,
      error: "webhook_processing_error",
    });
  }
}
