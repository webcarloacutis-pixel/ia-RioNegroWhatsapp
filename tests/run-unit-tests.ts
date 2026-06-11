import test from "node:test";

import "./lib/api.test";
import "./lib/constants.test";
import "./lib/format.test";
import "./lib/knowledge-metadata.test";
import "./lib/logger.test";
import "./lib/rionegro-content.test";
import "./lib/text-encoding.test";
import "./lib/url-security.test";
import "./lib/validations.test";
import "./server/assistant-session.test";
import "./server/assistant-memory-service.test";
import "./server/auth.test";
import "./server/channel-status-service.test";
import "./server/citizen-segmentation-service.test";
import "./server/knowledge-dashboard-service.test";
import "./server/middleware.test";
import "./server/message-service.test";
import "./server/scheduler-service.test";
import "./server/intent-classifier.test";
import "./server/conversation-router.test";
import "./server/whatsapp-reply-style.test";
import "./server/qa-dashboard-service.test";
import "./server/citizen-report-service.test";
import "./server/debug-api-routes.test";
import "./server/diagnostics-service.test";
import "./server/final-qa-phase9.test";
import "./server/external-mock-services.test";
import "./server/serializers.test";
import "./server/storage-service.test";
import "./server/upload-route.test";
import "./server/assistant-analytics-service.test";
import "./server/rionegro-assistant-internals.test";
import "./server/security-headers.test";

test("suite cargada", () => {
  // Punto de entrada para `tsx --test`.
});
