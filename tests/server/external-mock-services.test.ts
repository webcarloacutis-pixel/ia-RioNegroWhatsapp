import test from "node:test";
import assert from "node:assert/strict";

import {
  generateElevenLabsSpeech,
  getElevenLabsVoiceForLanguage,
  isElevenLabsConfigured,
  prepareAudioAnswer,
} from "@/server/elevenlabs-service";
import { generateAIText, transcribeAudio } from "@/server/openai-service";

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test("OpenAI mock evita llamadas reales de texto y transcripcion", async () => {
  const previousSimulation = process.env.SIMULATION_MODE;
  const previousOpenAiMock = process.env.OPENAI_MOCK;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;

  process.env.SIMULATION_MODE = "false";
  process.env.OPENAI_MOCK = "true";
  process.env.OPENAI_API_KEY = "";

  const text = await generateAIText({
    systemPrompt: "Sistema",
    userPrompt: "Pregunta de prueba",
  });
  const transcription = await transcribeAudio({
    audio: new Uint8Array([1, 2, 3]),
    filename: "nota.ogg",
    mimeType: "audio/ogg",
    language: "es",
  });

  assert.match(text, /mock/i);
  assert.match(transcription, /mock/i);

  restoreEnv("SIMULATION_MODE", previousSimulation);
  restoreEnv("OPENAI_MOCK", previousOpenAiMock);
  restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
});

test("ElevenLabs mock devuelve audio falso sin API key", async () => {
  const previousSimulation = process.env.SIMULATION_MODE;
  const previousMock = process.env.ELEVENLABS_MOCK;
  const previousKey = process.env.ELEVENLABS_API_KEY;
  const previousVoice = process.env.ELEVENLABS_VOICE_ID;
  const previousVoiceEs = process.env.ELEVENLABS_VOICE_ID_ES;
  const previousVoiceEn = process.env.ELEVENLABS_VOICE_ID_EN;

  process.env.SIMULATION_MODE = "false";
  process.env.ELEVENLABS_MOCK = "true";
  process.env.ELEVENLABS_API_KEY = "";
  process.env.ELEVENLABS_VOICE_ID = "";
  process.env.ELEVENLABS_VOICE_ID_ES = "voz-es-prueba";
  delete process.env.ELEVENLABS_VOICE_ID_EN;

  assert.equal(isElevenLabsConfigured(), true);
  assert.equal(getElevenLabsVoiceForLanguage("es"), "voz-es-prueba");
  assert.equal(getElevenLabsVoiceForLanguage("en"), "6rOxfAnZpbM3VIEhFaeV");

  const speech = await generateElevenLabsSpeech("Respuesta de prueba", { language: "en" });

  assert.equal(speech.mimeType, "audio/mpeg");
  assert.equal(Boolean(speech.audioBase64), true);
  assert.equal((speech as { voiceId?: string }).voiceId, "6rOxfAnZpbM3VIEhFaeV");
  assert.equal((speech as { simulated?: boolean }).simulated, true);

  restoreEnv("SIMULATION_MODE", previousSimulation);
  restoreEnv("ELEVENLABS_MOCK", previousMock);
  restoreEnv("ELEVENLABS_API_KEY", previousKey);
  restoreEnv("ELEVENLABS_VOICE_ID", previousVoice);
  restoreEnv("ELEVENLABS_VOICE_ID_ES", previousVoiceEs);
  restoreEnv("ELEVENLABS_VOICE_ID_EN", previousVoiceEn);
});

test("prepareAudioAnswer corta por oracion completa sin puntos suspensivos", () => {
  const fullAnswer = [
    "La Alcaldia queda en el Palacio Municipal, Carrera 50 #49-05.",
    "El horario de atencion es de lunes a jueves de 7:00 a. m. a 12:00 m. y de 1:00 p. m. a 5:00 p. m.",
    "Tambien puedes acercarte a Atencion al Ciudadano para resolver dudas adicionales.",
  ].join(" ");
  const result = prepareAudioAnswer({
    fullAnswer,
    language: "es",
    maxSeconds: 8,
    minSeconds: 3,
  });

  assert.match(result.audioText, /[.!?]$/);
  assert.doesNotMatch(result.audioText, /\.\.\./);
  assert.ok(countWords(result.audioText) <= 20);
  assert.equal(result.shouldAlsoSendText, true);
});

test("prepareAudioAnswer no termina en conectores incompletos", () => {
  const result = prepareAudioAnswer({
    fullAnswer:
      "Este resumen incluye ubicacion, horario, telefono, requisitos, canales de atencion y ademas varios detalles adicionales que deben ir en texto.",
    language: "es",
    maxSeconds: 4,
    minSeconds: 3,
  });

  assert.match(result.audioText, /[.!?]$/);
  assert.doesNotMatch(result.audioText.toLowerCase(), /\b(y|o|por ejemplo|tambien|ademas)\.?$/);
  assert.doesNotMatch(result.audioText, /\.\.\./);
});

test("generateElevenLabsSpeech usa texto preparado para audio largo", async () => {
  const previousSimulation = process.env.SIMULATION_MODE;
  const previousMock = process.env.ELEVENLABS_MOCK;
  const previousMaxSeconds = process.env.EVA_AUDIO_MAX_SECONDS;

  process.env.SIMULATION_MODE = "false";
  process.env.ELEVENLABS_MOCK = "true";
  process.env.EVA_AUDIO_MAX_SECONDS = "5";

  const speech = await generateElevenLabsSpeech(
    [
      "The City Hall is located at Palacio Municipal, Carrera 50 #49-05.",
      "The office hours are available in the official record for in-person attention.",
      "Please review the full written answer for all details before going.",
    ].join(" "),
    { language: "en" },
  );

  assert.equal(speech.mimeType, "audio/mpeg");
  assert.match((speech as { audioText?: string }).audioText ?? "", /[.!?]$/);
  assert.doesNotMatch((speech as { audioText?: string }).audioText ?? "", /\.\.\./);
  assert.equal((speech as { shouldAlsoSendText?: boolean }).shouldAlsoSendText, true);

  restoreEnv("SIMULATION_MODE", previousSimulation);
  restoreEnv("ELEVENLABS_MOCK", previousMock);
  restoreEnv("EVA_AUDIO_MAX_SECONDS", previousMaxSeconds);
});
