import { NextResponse } from "next/server";

import { chatWithAssistant, resetConversation } from "@/server/rionegro-assistant";
import { sendMessage } from "@/server/messageService";

type UltraMsgWebhookPayload = {
  event_type?: string;
  instanceId?: string;
  data?: {
    id?: string;
    from?: string;
    to?: string;
    body?: string;
    type?: string;
    fromMe?: boolean;
    time?: number;
  };
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function parseWebhookPayload(request: Request): Promise<UltraMsgWebhookPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as UltraMsgWebhookPayload;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const rawData = form.get("data");

    if (typeof rawData === "string") {
      try {
        return JSON.parse(rawData) as UltraMsgWebhookPayload;
      } catch {
        return {
          event_type: typeof form.get("event_type") === "string" ? String(form.get("event_type")) : undefined,
          instanceId: typeof form.get("instanceId") === "string" ? String(form.get("instanceId")) : undefined,
          data: {
            from: typeof form.get("from") === "string" ? String(form.get("from")) : undefined,
            to: typeof form.get("to") === "string" ? String(form.get("to")) : undefined,
            body: typeof form.get("body") === "string" ? String(form.get("body")) : undefined,
            type: typeof form.get("type") === "string" ? String(form.get("type")) : undefined,
            fromMe: String(form.get("fromMe") ?? "").toLowerCase() === "true",
          },
        };
      }
    }
  }

  const rawText = await request.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText) as UltraMsgWebhookPayload;
  } catch {
    return {};
  }
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

function buildSessionId(phoneNumber: string) {
  return `ultramsg:${phoneNumber}`;
}

function shouldIgnoreMessage(payload: UltraMsgWebhookPayload) {
  const body = payload.data?.body?.trim();
  const type = payload.data?.type?.trim().toLowerCase();

  if (payload.data?.fromMe) {
    return true;
  }

  if (!body) {
    return true;
  }

  if (type && type !== "chat") {
    return true;
  }

  return false;
}

function isResetCommand(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return ["reset", "reiniciar", "restart", "nuevo chat"].includes(normalized);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ultramsg-webhook",
  });
}

export async function POST(request: Request) {
  try {
    const payload = await parseWebhookPayload(request);

    if (payload.event_type && payload.event_type !== "message_received") {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "unsupported_event",
      });
    }

    if (shouldIgnoreMessage(payload)) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "unsupported_message",
      });
    }

    const incomingText = payload.data?.body?.trim() ?? "";
    const recipient = extractPhoneNumber(payload.data?.from);

    if (!recipient) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "invalid_sender",
      });
    }

    const sessionId = buildSessionId(recipient);

    if (isResetCommand(incomingText)) {
      resetConversation(sessionId);

      await sendMessage({
        message:
          "Conversacion reiniciada. Puedes hacer una nueva consulta oficial sobre Rionegro.\n\nEste es el canal oficial de informacion del municipio de Rionegro.",
        segment: null,
        scheduledAt: new Date(),
        mode: "MANUAL",
        to: recipient,
      });

      return NextResponse.json({
        ok: true,
        sent: true,
        to: recipient,
        reset: true,
      });
    }

    const result = await chatWithAssistant(sessionId, incomingText);

    await sendMessage({
      message: result.reply,
      segment: null,
      scheduledAt: new Date(),
      mode: "MANUAL",
      to: recipient,
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      to: recipient,
    });
  } catch (error) {
    console.error("[ultramsg-webhook] error", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error procesando el webhook de UltraMsg.",
      },
      { status: 500 },
    );
  }
}
