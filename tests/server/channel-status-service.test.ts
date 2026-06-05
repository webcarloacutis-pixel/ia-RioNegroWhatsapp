import test from "node:test";
import assert from "node:assert/strict";

import { getChannelRuntimeStatus } from "@/server/channel-status-service";

const ENV_KEYS = [
  "WHATSAPP_SAFE_MODE",
  "WHATSAPP_DRY_RUN",
  "ULTRAMSG_MOCK",
  "SIMULATION_MODE",
  "ULTRAMSG_TOKEN",
  "ULTRAMSG_BASE_URL",
  "ULTRAMSG_DEFAULT_TO",
  "SCHEDULER_ENABLED",
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

function withEnv(values: Partial<Record<EnvKey, string | undefined>>, run: () => void) {
  const previous = snapshotEnv();

  for (const [key, value] of Object.entries(values) as Array<[EnvKey, string | undefined]>) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    restoreEnv(previous);
  }
}

test("channel status detecta modo seguro", () => {
  withEnv(
    {
      WHATSAPP_SAFE_MODE: "true",
      WHATSAPP_DRY_RUN: "false",
      ULTRAMSG_MOCK: "false",
      SIMULATION_MODE: "false",
      ULTRAMSG_TOKEN: "token",
      ULTRAMSG_BASE_URL: "https://api.ultramsg.com/instance-test",
    },
    () => {
      const status = getChannelRuntimeStatus({ segmentsWithRecipients: 1 });

      assert.equal(status.mode, "blocked");
      assert.equal(status.realSendingReady, false);
      assert.equal(status.badgeTone, "danger");
    },
  );
});

test("channel status detecta modo prueba", () => {
  withEnv(
    {
      WHATSAPP_SAFE_MODE: "false",
      WHATSAPP_DRY_RUN: "true",
      ULTRAMSG_MOCK: "false",
      SIMULATION_MODE: "false",
    },
    () => {
      const status = getChannelRuntimeStatus();

      assert.equal(status.mode, "simulated");
      assert.equal(status.dryRun, true);
      assert.equal(status.badgeTone, "warning");
    },
  );
});

test("channel status detecta canal real activo", () => {
  withEnv(
    {
      WHATSAPP_SAFE_MODE: "false",
      WHATSAPP_DRY_RUN: "false",
      ULTRAMSG_MOCK: "false",
      SIMULATION_MODE: "false",
      ULTRAMSG_TOKEN: "token",
      ULTRAMSG_BASE_URL: "https://api.ultramsg.com/instance-test",
      ULTRAMSG_DEFAULT_TO: "+573001330213",
      SCHEDULER_ENABLED: "true",
    },
    () => {
      const status = getChannelRuntimeStatus();

      assert.equal(status.mode, "real");
      assert.equal(status.realSendingReady, true);
      assert.equal(status.hasRecipientSource, true);
      assert.equal(status.badgeTone, "success");
    },
  );
});
