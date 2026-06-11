import test from "node:test";
import assert from "node:assert/strict";

import {
  determineResponseChannel,
  getInputChannel,
  shouldAttemptTtsForResponseChannel,
} from "@/server/eva-channel";
import { getElevenLabsVoiceForLanguage } from "@/server/elevenlabs-service";

test("determineResponseChannel mantiene texto como texto aunque haya audio global activo", () => {
  assert.equal(
    getInputChannel({
      incomingMessageType: "chat",
      hasText: true,
    }),
    "text",
  );
  assert.equal(
    determineResponseChannel({
      incomingMessageType: "chat",
      hasText: true,
    }),
    "text",
  );
});

test("determineResponseChannel responde audio solo cuando la entrada incluye audio", () => {
  assert.equal(
    determineResponseChannel({
      incomingMessageType: "ptt",
      hasAudio: true,
      hasText: true,
    }),
    "audio",
  );
  assert.equal(
    determineResponseChannel({
      incomingMessageType: "image",
      hasImage: true,
      hasText: true,
    }),
    "text",
  );
  assert.equal(
    determineResponseChannel({
      incomingMessageType: "audio",
      hasAudio: true,
      hasImage: true,
    }),
    "audio",
  );
});

test("canal de respuesta decide si se debe intentar ElevenLabs", () => {
  assert.equal(
    shouldAttemptTtsForResponseChannel({
      responseChannel: "text",
      audioEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldAttemptTtsForResponseChannel({
      responseChannel: "audio",
      audioEnabled: true,
    }),
    true,
  );
  assert.equal(getElevenLabsVoiceForLanguage("en"), "6rOxfAnZpbM3VIEhFaeV");
});
