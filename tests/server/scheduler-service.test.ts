import test from "node:test";
import assert from "node:assert/strict";

import {
  createAnnouncement,
  createSegment,
  getSchedulerData,
  listAnnouncements,
  processScheduledAnnouncements,
  resetMockStoreForTests,
  sendAnnouncementNow,
} from "@/server/mock-store";
import { formatDateTimeForDateTimeLocalBogota } from "@/lib/format";
import { GET as cronGet } from "@/app/api/cron/process-scheduled-announcements/route";
import { POST as adminRunPost } from "@/app/api/admin/scheduler/run/route";

const ENV_KEYS = [
  "WHATSAPP_DRY_RUN",
  "WHATSAPP_SAFE_MODE",
  "ULTRAMSG_MOCK",
  "ULTRAMSG_DEFAULT_TO",
  "ULTRAMSG_TOKEN",
  "ULTRAMSG_BASE_URL",
  "SIMULATION_MODE",
  "CRON_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function snapshotEnv() {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<EnvKey, string | undefined>) {
  for (const [key, value] of snapshot.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function withEnv<T>(
  values: Partial<Record<EnvKey, string | undefined>>,
  run: () => Promise<T>,
) {
  const previous = snapshotEnv();

  for (const [key, value] of Object.entries(values) as Array<[EnvKey, string | undefined]>) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    restoreEnv(previous);
  }
}

function dateTimeLocalFromNow(offsetMs: number) {
  return formatDateTimeForDateTimeLocalBogota(new Date(Date.now() + offsetMs));
}

async function createTestSegment(phones = ["+573001330213"]) {
  return createSegment({
    name: `Segmento test ${Date.now()} ${Math.random()}`,
    description: null,
    estimatedUsers: phones.length,
    recipientPhones: phones,
  });
}

async function createTestAnnouncement(input: {
  segmentId: string | null;
  scheduledAt: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
}) {
  return createAnnouncement({
    title: `Comunicado test ${Date.now()} ${Math.random()}`,
    message: "Mensaje de prueba del scheduler",
    location: "Rionegro",
    type: "GENERAL",
    scheduledAt: input.scheduledAt,
    segmentId: input.segmentId,
    imageUrl: input.imageUrl ?? null,
    imageFilename: input.imageUrl ? "flyer.png" : null,
    imageMimeType: input.imageUrl ? "image/png" : null,
    audioUrl: input.audioUrl ?? null,
    audioFilename: input.audioUrl ? "nota.mp3" : null,
    audioMimeType: input.audioUrl ? "audio/mpeg" : null,
  });
}

test("scheduler no envia comunicados futuros", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      const announcement = await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(60 * 60 * 1000),
      });

      const result = await processScheduledAnnouncements({ source: "worker" });
      const current = (await listAnnouncements()).find((item) => item.id === announcement.id);

      assert.equal(result.dueCount, 0);
      assert.equal(result.processedCount, 0);
      assert.equal(current?.status, "SCHEDULED");
    },
  );
});

test("scheduler procesa comunicado vencido de texto", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const result = await processScheduledAnnouncements({ source: "worker" });

      assert.equal(result.dueCount, 1);
      assert.equal(result.lockedCount, 1);
      assert.equal(result.processedCount, 1);
      assert.equal(result.simulatedCount, 1);
      assert.match(result.processed[0]?.details ?? "", /Dry-run UltraMsg OK/i);
    },
  );
});

test("scheduler no reprocesa comunicados ya enviados", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      const announcement = await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      await sendAnnouncementNow(announcement.id);
      const result = await processScheduledAnnouncements({ source: "worker" });

      assert.equal(result.dueCount, 0);
      assert.equal(result.processedCount, 0);
    },
  );
});

test("scheduler marca FAILED cuando faltan destinatarios", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      await createTestAnnouncement({
        segmentId: null,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const result = await processScheduledAnnouncements({ source: "worker" });
      const current = (await listAnnouncements())[0];

      assert.equal(result.failedCount, 1);
      assert.equal(current?.status, "FAILED");
      assert.match(result.processed[0]?.details ?? "", /NO_RECIPIENTS/);
    },
  );
});

test("scheduler con WHATSAPP_SAFE_MODE marca bloqueado", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "false",
      WHATSAPP_SAFE_MODE: "true",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const result = await processScheduledAnnouncements({ source: "worker" });
      const current = (await listAnnouncements())[0];

      assert.equal(result.blockedCount, 1);
      assert.equal(result.sentCount, 0);
      assert.equal(current?.status, "BLOCKED_BY_SAFE_MODE");
    },
  );
});

test("scheduler con WHATSAPP_DRY_RUN marca simulado", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "true",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const result = await processScheduledAnnouncements({ source: "worker" });

      assert.equal(result.simulatedCount, 1);
      assert.equal(result.blockedCount, 0);
    },
  );
});

test("scheduler con ULTRAMSG_MOCK marca simulado", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "false",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "true",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const result = await processScheduledAnnouncements({ source: "worker" });

      assert.equal(result.simulatedCount, 1);
      assert.equal(result.sentCount, 0);
    },
  );
});

test("scheduler incluye imagen en comunicado programado", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
        imageUrl: "https://res.cloudinary.com/demo/image/upload/flyer.png",
      });

      const result = await processScheduledAnnouncements({ source: "worker" });

      assert.equal(result.simulatedCount, 1);
      assert.match(result.processed[0]?.details ?? "", /con imagen/i);
    },
  );
});

test("scheduler incluye audio en comunicado programado", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
        audioUrl: "https://res.cloudinary.com/demo/video/upload/nota.mp3",
      });

      const result = await processScheduledAnnouncements({ source: "worker" });

      assert.equal(result.simulatedCount, 1);
      assert.match(result.processed[0]?.details ?? "", /con audio/i);
    },
  );
});

test("cron endpoint rechaza secret invalido", async () => {
  await withEnv({ CRON_SECRET: "secret-correcto" }, async () => {
    const response = await cronGet(
      new Request("http://localhost/api/cron/process-scheduled-announcements?secret=malo"),
    );
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.ok, false);
  });
});

test("cron endpoint procesa con secret valido", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      CRON_SECRET: "secret-correcto",
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const response = await cronGet(
        new Request("http://localhost/api/cron/process-scheduled-announcements?secret=secret-correcto"),
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.processed, 1);
      assert.equal(payload.simulated, 1);
    },
  );
});

test("admin scheduler run requiere sesion", async () => {
  const response = await adminRunPost(
    new Request("http://localhost/api/admin/scheduler/run", { method: "POST" }),
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.match(payload.error, /No autorizado/i);
});

test("lock evita doble envio programado", async () => {
  resetMockStoreForTests();

  await withEnv(
    {
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_SAFE_MODE: "false",
      ULTRAMSG_MOCK: "false",
      ULTRAMSG_DEFAULT_TO: "",
    },
    async () => {
      const segment = await createTestSegment();
      await createTestAnnouncement({
        segmentId: segment.id,
        scheduledAt: dateTimeLocalFromNow(-60 * 1000),
      });

      const [left, right] = await Promise.all([
        processScheduledAnnouncements({ source: "worker" }),
        processScheduledAnnouncements({ source: "cron" }),
      ]);
      const data = await getSchedulerData();

      assert.equal(left.processedCount + right.processedCount, 1);
      assert.equal(data.recentLogs.length, 1);
    },
  );
});
