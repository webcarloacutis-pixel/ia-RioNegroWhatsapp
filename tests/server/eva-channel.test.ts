import test from "node:test";
import assert from "node:assert/strict";

import { determineResponseChannel, getInputChannel } from "@/server/eva-channel";

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
