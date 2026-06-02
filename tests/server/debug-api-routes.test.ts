import test from "node:test";
import assert from "node:assert/strict";

import { GET as healthGet } from "@/app/api/health/route";
import { GET as envGet } from "@/app/api/debug/env/route";
import { GET as routesGet } from "@/app/api/debug/routes/route";
import { GET as dbGet } from "@/app/api/debug/db/route";
import { GET as ultramsgGet } from "@/app/api/debug/ultramsg/route";
import { GET as announcementsGet } from "@/app/api/debug/announcements/route";
import { GET as citizenReportsGet } from "@/app/api/debug/citizen-reports/route";
import { POST as webhookPost } from "@/app/api/webhook/route";

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("debug endpoints responden JSON sin exponer secretos", async () => {
  const responses = await Promise.all([
    healthGet(),
    envGet(),
    routesGet(),
    dbGet(),
    ultramsgGet(),
    announcementsGet(),
    citizenReportsGet(),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 200);
    const body = await json(response);
    const serialized = JSON.stringify(body);

    assert.equal(typeof body.ok, "boolean");
    assert.doesNotMatch(serialized, /sk-proj-|xi-api-key|ULTRAMSG_TOKEN=/i);
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
