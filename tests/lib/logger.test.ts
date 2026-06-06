import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyPrismaError,
  maskEmail,
  maskPhone,
  maskSecret,
  sanitizeLogPayload,
} from "@/lib/logger";

test("maskSecret oculta secretos", () => {
  assert.equal(maskSecret("abc123"), "[REDACTED]");
  assert.equal(maskSecret(""), "");
});

test("maskPhone oculta telefono colombiano", () => {
  assert.equal(maskPhone("+573001330213"), "+57******0213");
});

test("maskEmail oculta email", () => {
  assert.equal(maskEmail("admin@rionegro.gov"), "a***n@rionegro.gov");
});

test("sanitizeLogPayload elimina tokens y datos sensibles", () => {
  const sanitized = sanitizeLogPayload({
    ULTRAMSG_TOKEN: "token-real",
    OPENAI_API_KEY: "sk-real",
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/app",
    to: "+573001330213",
    email: "admin@rionegro.gov",
  });
  const text = JSON.stringify(sanitized);

  assert.equal(text.includes("token-real"), false);
  assert.equal(text.includes("sk-real"), false);
  assert.equal(text.includes("password"), false);
  assert.equal(text.includes("+573001330213"), false);
  assert.equal(text.includes("admin@rionegro.gov"), false);
  assert.match(text, /REDACTED|postgresql/);
});

test("sanitizeLogPayload conserva requestId y fechas", () => {
  const sanitized = sanitizeLogPayload({
    requestId: "e036fa20-d102-4d3b-b704-8873949feb3b",
    scheduledAt: "2026-04-20T10:00:00.000Z",
  });

  assert.equal(
    JSON.stringify(sanitized).includes("e036fa20-d102-4d3b-b704-8873949feb3b"),
    true,
  );
  assert.equal(JSON.stringify(sanitized).includes("2026-04-20T10:00:00.000Z"), true);
});

test("classifyPrismaError detecta tabla faltante P2021", () => {
  const error = Object.assign(new Error("The table `KnowledgeBaseEntry` does not exist"), {
    code: "P2021",
    meta: {
      modelName: "KnowledgeBaseEntry",
    },
  });
  const classification = classifyPrismaError(error);

  assert.equal(classification.type, "TABLE_NOT_FOUND");
  assert.equal(classification.code, "P2021");
  assert.equal(classification.model, "KnowledgeBaseEntry");
});
