type SendMessageInput = {
  message: string;
  segment:
    | {
        id: string | null;
        name: string;
        estimatedUsers: number;
      }
    | null;
  scheduledAt: Date;
  mode?: "DEMO" | "MANUAL" | "SCHEDULED";
  to?: string | null;
};

const DEFAULT_AUDIENCE = 1250;
const ULTRAMSG_API_URL = process.env.ULTRAMSG_API_URL?.trim() ?? "";
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN?.trim() ?? "";
const ULTRAMSG_DEFAULT_TO = process.env.ULTRAMSG_DEFAULT_TO?.trim() ?? "";

function isUltraMsgConfigured() {
  return Boolean(ULTRAMSG_API_URL && ULTRAMSG_TOKEN);
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

async function sendMessageMock({
  message,
  segment,
  scheduledAt,
  mode,
}: SendMessageInput) {
  const deliveredCount = segment?.estimatedUsers ?? DEFAULT_AUDIENCE;
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
  const recipients = resolveRecipients(to);

  if (!recipients.length) {
    throw new Error("No hay destinatarios configurados para UltraMsg.");
  }

  const responses: unknown[] = [];

  for (const recipient of recipients) {
    const payload = new URLSearchParams({
      token: ULTRAMSG_TOKEN,
      to: recipient,
      body: message,
    });

    const response = await fetch(`${ULTRAMSG_API_URL.replace(/\/$/, "")}/messages/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });

    const rawText = await response.text();
    let parsedBody: unknown = rawText;

    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      // Mantener texto crudo si UltraMsg no devuelve JSON.
    }

    if (!response.ok) {
      console.error("[messageService] error UltraMsg", {
        mode,
        scheduledAt: scheduledAt.toISOString(),
        segment: targetName,
        to: recipient,
        status: response.status,
        body: parsedBody,
      });

      throw new Error(`UltraMsg devolvio ${response.status} al enviar a ${recipient}.`);
    }

    responses.push({
      to: recipient,
      body: parsedBody,
    });
  }

  console.log("[messageService] envio UltraMsg ejecutado", {
    mode,
    scheduledAt: scheduledAt.toISOString(),
    segment: targetName,
    to: recipients,
    body: responses,
  });

  return {
    deliveredCount: recipients.length,
    log: `Enviado por UltraMsg a ${recipients.join(", ")}`,
  };
}

export async function sendMessage(input: SendMessageInput) {
  if (input.mode === "DEMO") {
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
