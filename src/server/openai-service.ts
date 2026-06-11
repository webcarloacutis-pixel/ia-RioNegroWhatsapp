import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as {
  __rionegroOpenAIClient?: OpenAI | null;
};

function isSimulationMode() {
  return process.env.SIMULATION_MODE === "true";
}

export function isOpenAIMockMode() {
  return process.env.OPENAI_MOCK === "true" || isSimulationMode();
}

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY) || isOpenAIMockMode();
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

export function getOpenAITranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe";
}

function getClient() {
  if (isOpenAIMockMode()) {
    return null;
  }

  if (!isOpenAIConfigured()) {
    return null;
  }

  if (!globalForOpenAI.__rionegroOpenAIClient) {
    globalForOpenAI.__rionegroOpenAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return globalForOpenAI.__rionegroOpenAIClient;
}

export async function generateOpenAIText(input: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}) {
  if (isOpenAIMockMode()) {
    console.log("[openai] mock text generated", {
      chars: input.userPrompt.length,
    });

    return "Respuesta mock de OpenAI para simulacion segura.";
  }

  const client = getClient();

  if (!client) {
    return null;
  }

  const response = await client.responses.create({
    model: getOpenAIModel(),
    max_output_tokens: input.maxOutputTokens ?? 520,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: input.systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: input.userPrompt }],
      },
    ],
  });

  return response.output_text.trim();
}

export async function generateAIText(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const generatedText = await generateOpenAIText(input);
  return generatedText ?? "";
}

function toArrayBuffer(audio: ArrayBuffer | Uint8Array) {
  if (audio instanceof ArrayBuffer) {
    return audio;
  }

  return audio.buffer.slice(
    audio.byteOffset,
    audio.byteOffset + audio.byteLength,
  ) as ArrayBuffer;
}

export async function transcribeAudio(input: {
  audio: ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  language?: string;
}) {
  if (isOpenAIMockMode()) {
    console.log("[transcription] mock result", {
      filename: input.filename ?? "nota-voz.ogg",
      mimeType: input.mimeType ?? "audio/ogg",
      language: input.language ?? "es",
    });

    return "Transcripcion mock de nota de voz para simulacion segura.";
  }

  const client = getClient();

  if (!client) {
    throw new Error("OpenAI no esta configurado para transcribir audio.");
  }

  const file = new File(
    [toArrayBuffer(input.audio)],
    input.filename || "nota-voz.ogg",
    {
      type: input.mimeType || "audio/ogg",
    },
  );

  const response = await client.audio.transcriptions.create({
    file,
    model: getOpenAITranscriptionModel(),
    language: input.language || "es",
    prompt:
      "Transcribe una nota de voz de WhatsApp. Mantén nombres, direcciones, productos, precios, fechas y datos importantes.",
  });

  return response.text.trim();
}
