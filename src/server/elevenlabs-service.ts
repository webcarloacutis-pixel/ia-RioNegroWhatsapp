const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_LANGUAGE_CODE = "es";
const MAX_SPEECH_TEXT_LENGTH = 1200;

function getElevenLabsApiKey() {
  return process.env.ELEVENLABS_API_KEY?.trim() ?? "";
}

function getElevenLabsVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID?.trim() ?? "";
}

function getElevenLabsOutputFormat() {
  return process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || DEFAULT_OUTPUT_FORMAT;
}

function trimSpeechText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_SPEECH_TEXT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_SPEECH_TEXT_LENGTH - 1).trim()}...`;
}

export function isElevenLabsConfigured() {
  return Boolean(getElevenLabsApiKey() && getElevenLabsVoiceId());
}

export async function generateElevenLabsSpeech(text: string) {
  const apiKey = getElevenLabsApiKey();
  const voiceId = getElevenLabsVoiceId();

  if (!apiKey || !voiceId) {
    throw new Error("ElevenLabs no esta configurado.");
  }

  const outputFormat = getElevenLabsOutputFormat();
  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${encodeURIComponent(
      outputFormat,
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: trimSpeechText(text),
        model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID,
        language_code:
          process.env.ELEVENLABS_LANGUAGE_CODE?.trim() || DEFAULT_LANGUAGE_CODE,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs respondio con estado ${response.status}.`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  console.log("[elevenlabs] audio generated", {
    bytes: audioBuffer.byteLength,
    outputFormat,
  });

  return {
    audioBase64: audioBuffer.toString("base64"),
    mimeType: "audio/mpeg" as const,
    outputFormat,
  };
}
