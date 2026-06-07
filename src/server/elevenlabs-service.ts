const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_LANGUAGE_CODE = "es";
const DEFAULT_ENGLISH_VOICE_ID = "6rOxfAnZpbM3VIEhFaeV";
const MAX_SPEECH_TEXT_LENGTH = 1200;
type SpeechLanguage = "es" | "en";

function isSimulationMode() {
  return process.env.SIMULATION_MODE === "true";
}

export function isElevenLabsMockMode() {
  return process.env.ELEVENLABS_MOCK === "true" || isSimulationMode();
}

function getElevenLabsApiKey() {
  return process.env.ELEVENLABS_API_KEY?.trim() ?? "";
}

function getElevenLabsVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID?.trim() ?? "";
}

export function getElevenLabsVoiceForLanguage(language: SpeechLanguage = "es") {
  if (language === "en") {
    return process.env.ELEVENLABS_VOICE_ID_EN?.trim() || DEFAULT_ENGLISH_VOICE_ID;
  }

  return process.env.ELEVENLABS_VOICE_ID_ES?.trim() || getElevenLabsVoiceId();
}

function getElevenLabsLanguageCode(language: SpeechLanguage) {
  if (language === "en") return "en";
  return process.env.ELEVENLABS_LANGUAGE_CODE?.trim() || DEFAULT_LANGUAGE_CODE;
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

export function isElevenLabsConfigured(language: SpeechLanguage = "es") {
  return Boolean(getElevenLabsApiKey() && getElevenLabsVoiceForLanguage(language)) || isElevenLabsMockMode();
}

export async function generateElevenLabsSpeech(
  text: string,
  options: { language?: SpeechLanguage } = {},
) {
  const language = options.language ?? "es";

  if (isElevenLabsMockMode()) {
    const outputFormat = getElevenLabsOutputFormat();
    const voiceId = getElevenLabsVoiceForLanguage(language);

    console.log("[elevenlabs] mock audio generated", {
      chars: trimSpeechText(text).length,
      outputFormat,
      language,
      voiceId,
    });

    return {
      audioBase64: Buffer.from("mock-elevenlabs-audio").toString("base64"),
      mimeType: "audio/mpeg" as const,
      outputFormat,
      voiceId,
      language,
      simulated: true,
    };
  }

  const apiKey = getElevenLabsApiKey();
  const voiceId = getElevenLabsVoiceForLanguage(language);

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
        language_code: getElevenLabsLanguageCode(language),
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
    language,
    voiceId,
  });

  return {
    audioBase64: audioBuffer.toString("base64"),
    mimeType: "audio/mpeg" as const,
    outputFormat,
    voiceId,
    language,
  };
}
