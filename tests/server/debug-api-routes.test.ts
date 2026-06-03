import test from "node:test";
import assert from "node:assert/strict";

import { GET as healthGet } from "@/app/api/health/route";
import { GET as envGet } from "@/app/api/debug/env/route";
import { GET as routesGet } from "@/app/api/debug/routes/route";
import { GET as dbGet } from "@/app/api/debug/db/route";
import { GET as ultramsgGet } from "@/app/api/debug/ultramsg/route";
import { GET as announcementsGet } from "@/app/api/debug/announcements/route";
import { GET as citizenReportsGet } from "@/app/api/debug/citizen-reports/route";
import { GET as webhookDebugGet } from "@/app/api/debug/webhook/route";
import { POST as webhookPost } from "@/app/api/webhook/route";
import { authInternals } from "@/lib/auth";
import { resetRateLimit } from "@/lib/rate-limit";

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function makeWebhookRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3030/api/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      event_type: "message_received",
      instanceId: "instance177604",
      data: {
        id: `test-secret-${Date.now()}`,
        from: "573001330213@c.us",
        body: "mensaje de prueba",
        type: "chat",
        fromMe: true,
      },
    }),
  });
}

function makeDebugRequest(cookie?: string) {
  const headers = new Headers();

  if (cookie) {
    headers.set("Cookie", `${authInternals.AUTH_COOKIE_NAME}=${cookie}`);
  }

  return new Request("http://localhost:3030/api/debug/env", { headers });
}

test("debug endpoints requieren sesion administrativa", async () => {
  const response = await envGet(makeDebugRequest());

  assert.equal(response.status, 401);
});

test("debug endpoints autenticados responden JSON sin exponer secretos", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  const previousEmail = process.env.ADMIN_EMAIL;

  process.env.SESSION_SECRET = "debug-routes-test-secret";
  process.env.ADMIN_EMAIL = "admin@rionegro.gov";

  try {
    const cookie = authInternals.createSignedSessionCookieValue();
    const responses = await Promise.all([
      healthGet(),
      envGet(makeDebugRequest(cookie)),
      routesGet(makeDebugRequest(cookie)),
      dbGet(makeDebugRequest(cookie)),
      ultramsgGet(makeDebugRequest(cookie)),
      announcementsGet(makeDebugRequest(cookie)),
      citizenReportsGet(makeDebugRequest(cookie)),
      webhookDebugGet(makeDebugRequest(cookie)),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
      const body = await json(response);
      const serialized = JSON.stringify(body);

      assert.equal(typeof body.ok, "boolean");
      assert.doesNotMatch(serialized, /sk-proj-|xi-api-key|ULTRAMSG_TOKEN=/i);
    }
  } finally {
    if (previousSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previousSecret;
    }

    if (previousEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = previousEmail;
    }
  }
});

test("webhook acepta POST en dry-run sin enviar mensajes reales", async () => {
  const previousDryRun = process.env.WHATSAPP_DRY_RUN;
  const previousAudio = process.env.WHATSAPP_AUDIO_REPLIES;
  const previousOpenAI = process.env.OPENAI_API_KEY;

  process.env.WHATSAPP_DRY_RUN = "true";
  process.env.WHATSAPP_AUDIO_REPLIES = "false";
  process.env.OPENAI_API_KEY = "";

  const response = await webhookPost(
    new Request("http://localhost:3030/api/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "message_received",
        instanceId: "instance177604",
        data: {
          id: `test-reset-${Date.now()}`,
          from: "573001330213@c.us",
          body: "reset",
          type: "chat",
          fromMe: false,
        },
      }),
    }),
  );

  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);

  process.env.WHATSAPP_DRY_RUN = previousDryRun;
  process.env.WHATSAPP_AUDIO_REPLIES = previousAudio;
  process.env.OPENAI_API_KEY = previousOpenAI;
});

test("webhook UltraMsg exige secreto solo cuando esta configurado", async () => {
  const previousSecret = process.env.ULTRAMSG_WEBHOOK_SECRET;

  process.env.ULTRAMSG_WEBHOOK_SECRET = "webhook-secret-test";

  try {
    const unauthorized = await webhookPost(makeWebhookRequest());
    const unauthorizedBody = await json(unauthorized);
    const authorized = await webhookPost(
      makeWebhookRequest({
        "x-ultramsg-webhook-secret": "webhook-secret-test",
      }),
    );
    const authorizedBody = await json(authorized);

    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorizedBody.ok, false);
    assert.equal(authorized.status, 200);
    assert.equal(authorizedBody.ok, true);
    assert.equal(authorizedBody.ignored, true);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.ULTRAMSG_WEBHOOK_SECRET;
    } else {
      process.env.ULTRAMSG_WEBHOOK_SECRET = previousSecret;
    }
  }
});

test("webhook UltraMsg rechaza content-type no soportado", async () => {
  const response = await webhookPost(
    new Request("http://localhost:3030/api/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      body: "<message />",
    }),
  );
  const body = await json(response);

  assert.equal(response.status, 415);
  assert.equal(body.ok, false);
});

test("webhook UltraMsg aplica rate limit por IP", async () => {
  const previousRateLimit = process.env.RATE_LIMIT_ENABLED;
  const ip = "203.0.113.45";

  process.env.RATE_LIMIT_ENABLED = "true";
  resetRateLimit(`ultramsg-webhook:${ip}`);

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await webhookPost(
        makeWebhookRequest({
          "x-forwarded-for": ip,
        }),
      );

      assert.equal(response.status, 200);
    }

    const blocked = await webhookPost(
      makeWebhookRequest({
        "x-forwarded-for": ip,
      }),
    );
    const body = await json(blocked);

    assert.equal(blocked.status, 429);
    assert.equal(body.ok, false);
  } finally {
    resetRateLimit(`ultramsg-webhook:${ip}`);

    if (previousRateLimit === undefined) {
      delete process.env.RATE_LIMIT_ENABLED;
    } else {
      process.env.RATE_LIMIT_ENABLED = previousRateLimit;
    }
  }
});
