import test from "node:test";
import assert from "node:assert/strict";

import { generateElevenLabsSpeech, isElevenLabsConfigured } from "@/server/elevenlabs-service";
import { generateAIText, transcribeAudio } from "@/server/openai-service";

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

  process.env.SIMULATION_MODE = previousSimulation;
  process.env.OPENAI_MOCK = previousOpenAiMock;
  process.env.OPENAI_API_KEY = previousOpenAiKey;
});

test("ElevenLabs mock devuelve audio falso sin API key", async () => {
  const previousSimulation = process.env.SIMULATION_MODE;
  const previousMock = process.env.ELEVENLABS_MOCK;
  const previousKey = process.env.ELEVENLABS_API_KEY;
  const previousVoice = process.env.ELEVENLABS_VOICE_ID;

  process.env.SIMULATION_MODE = "false";
  process.env.ELEVENLABS_MOCK = "true";
  process.env.ELEVENLABS_API_KEY = "";
  process.env.ELEVENLABS_VOICE_ID = "";

  assert.equal(isElevenLabsConfigured(), true);

  const speech = await generateElevenLabsSpeech("Respuesta de prueba");

  assert.equal(speech.mimeType, "audio/mpeg");
  assert.equal(Boolean(speech.audioBase64), true);
  assert.equal((speech as { simulated?: boolean }).simulated, true);

  process.env.SIMULATION_MODE = previousSimulation;
  process.env.ELEVENLABS_MOCK = previousMock;
  process.env.ELEVENLABS_API_KEY = previousKey;
  process.env.ELEVENLABS_VOICE_ID = previousVoice;
});
