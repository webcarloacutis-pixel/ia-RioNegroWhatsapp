const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_LANGUAGE_CODE = "es";
const DEFAULT_ENGLISH_VOICE_ID = "6rOxfAnZpbM3VIEhFaeV";
const DEFAULT_AUDIO_MIN_SECONDS = 3;
const DEFAULT_AUDIO_MAX_SECONDS = 35;
const AUDIO_WORDS_PER_SECOND: Record<SpeechLanguage, number> = {
  es: 2.5,
  en: 2.7,
};
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

function getConfiguredAudioSeconds(key: string, fallback: number) {
  const configured = Number(process.env[key]);

  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function normalizeSpeechWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function countWords(text: string) {
  return normalizeSpeechWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function splitCompleteSentences(text: string) {
  const normalized = text
    .replace(/\r?\n+/g, ". ")
    .replace(/\s*[-*]\s+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const matches = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [];

  return matches
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (/[.!?]$/.test(item) ? item : `${item}.`));
}

function endsIncomplete(text: string) {
  const normalized = normalizeSpeechWhitespace(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    /(\.\.\.|[,;:]|\b(?:y|o|por ejemplo|tambien|ademas|and|or|also|for example)\.?)$/.test(
      normalized,
    ) || !/[.!?]$/.test(normalized)
  );
}

function finishCompleteSentence(text: string, language: SpeechLanguage) {
  let words = normalizeSpeechWhitespace(text).split(/\s+/).filter(Boolean);

  while (words.length > 1 && endsIncomplete(words.join(" "))) {
    words = words.slice(0, -1);
  }

  const cleaned = words.join(" ").replace(/[,\s;:]+$/g, "").trim();

  if (!cleaned) {
    return language === "en"
      ? "I have information about that, but I need to send it as text so it is not cut off."
      : "Tengo información sobre eso, pero debo enviarla en texto para que no se corte.";
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function fitFirstSentenceByWords(sentence: string, maxWords: number, language: SpeechLanguage) {
  const words = normalizeSpeechWhitespace(sentence).split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return finishCompleteSentence(sentence, language);
  }

  return finishCompleteSentence(words.slice(0, maxWords).join(" "), language);
}

export function prepareAudioAnswer(input: {
  fullAnswer: string;
  language: SpeechLanguage;
  maxSeconds?: number;
  minSeconds?: number;
}) {
  const maxSeconds = input.maxSeconds ?? getConfiguredAudioSeconds(
    "EVA_AUDIO_MAX_SECONDS",
    DEFAULT_AUDIO_MAX_SECONDS,
  );
  const minSeconds = input.minSeconds ?? getConfiguredAudioSeconds(
    "EVA_AUDIO_MIN_SECONDS",
    DEFAULT_AUDIO_MIN_SECONDS,
  );
  const wordsPerSecond = AUDIO_WORDS_PER_SECOND[input.language];
  const maxWords = Math.max(10, Math.min(90, Math.floor(maxSeconds * wordsPerSecond)));
  const minWords = Math.max(6, Math.ceil(minSeconds * wordsPerSecond));
  const normalized = normalizeSpeechWhitespace(input.fullAnswer);
  const sentences = splitCompleteSentences(normalized);
  const selected: string[] = [];
  let selectedWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);

    if (!selected.length && sentenceWords > maxWords) {
      const audioText = fitFirstSentenceByWords(sentence, maxWords, input.language);

      return {
        audioText,
        shouldAlsoSendText: countWords(normalized) > countWords(audioText),
        textComplement: countWords(normalized) > countWords(audioText) ? normalized : undefined,
      };
    }

    if (selectedWords + sentenceWords > maxWords) {
      break;
    }

    selected.push(sentence);
    selectedWords += sentenceWords;
  }

  const audioText = finishCompleteSentence(
    selected.length ? selected.join(" ") : fitFirstSentenceByWords(normalized, maxWords, input.language),
    input.language,
  );
  const shouldAlsoSendText =
    countWords(normalized) > countWords(audioText) || countWords(audioText) < minWords;

  return {
    audioText,
    shouldAlsoSendText,
    textComplement: shouldAlsoSendText ? normalized : undefined,
  };
}

function trimSpeechText(text: string, language: SpeechLanguage) {
  return prepareAudioAnswer({
    fullAnswer: text,
    language,
  }).audioText;
}

export function isElevenLabsConfigured(language: SpeechLanguage = "es") {
  return Boolean(getElevenLabsApiKey() && getElevenLabsVoiceForLanguage(language)) || isElevenLabsMockMode();
}

export async function generateElevenLabsSpeech(
  text: string,
  options: { language?: SpeechLanguage } = {},
) {
  const language = options.language ?? "es";
  const prepared = prepareAudioAnswer({
    fullAnswer: text,
    language,
  });

  if (isElevenLabsMockMode()) {
    const outputFormat = getElevenLabsOutputFormat();
    const voiceId = getElevenLabsVoiceForLanguage(language);

    console.log("[elevenlabs] mock audio generated", {
      chars: prepared.audioText.length,
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
      audioText: prepared.audioText,
      shouldAlsoSendText: prepared.shouldAlsoSendText,
      textComplement: prepared.textComplement,
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
        text: prepared.audioText,
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
    audioText: prepared.audioText,
    shouldAlsoSendText: prepared.shouldAlsoSendText,
    textComplement: prepared.textComplement,
  };
}
