import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { parseRequestBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { JSON_BODY_LIMIT_BYTES } from "@/lib/request-security";

const bodySchema = z.object({
  value: z.string(),
});

function isAppErrorStatus(status: number) {
  return (error: unknown) => error instanceof AppError && error.status === status;
}

test("parseRequestBody rechaza content-type no JSON", async () => {
  await assert.rejects(
    parseRequestBody(
      new Request("http://localhost:3030/api/test", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ value: "ok" }),
      }),
      bodySchema,
    ),
    isAppErrorStatus(415),
  );
});

test("parseRequestBody rechaza cuerpos demasiado grandes", async () => {
  await assert.rejects(
    parseRequestBody(
      new Request("http://localhost:3030/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(JSON_BODY_LIMIT_BYTES) }),
      }),
      bodySchema,
    ),
    isAppErrorStatus(413),
  );
});

test("parseRequestBody devuelve 400 para JSON invalido", async () => {
  await assert.rejects(
    parseRequestBody(
      new Request("http://localhost:3030/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      bodySchema,
    ),
    isAppErrorStatus(400),
  );
});
