import test from "node:test";

import "./lib/constants.test";
import "./lib/format.test";
import "./lib/validations.test";
import "./server/assistant-session.test";
import "./server/message-service.test";
import "./server/serializers.test";
import "./server/assistant-analytics-service.test";
import "./server/rionegro-assistant-internals.test";

test("suite cargada", () => {
  // Punto de entrada para `tsx --test`.
});
