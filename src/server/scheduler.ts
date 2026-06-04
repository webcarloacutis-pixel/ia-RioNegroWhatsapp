import "dotenv/config";

import { getErrorMessage } from "@/lib/errors";
import { processScheduledAnnouncements } from "@/server/panel-service";

function getSchedulerIntervalMs() {
  const configured = Number(process.env.SCHEDULER_INTERVAL_SECONDS);
  const seconds = Number.isInteger(configured) && configured > 0 ? configured : 15;

  return seconds * 1000;
}

function isSchedulerEnabled() {
  return process.env.SCHEDULER_ENABLED !== "false";
}

const POLL_INTERVAL_MS = getSchedulerIntervalMs();
let lastLoggedError = "";
let lastLoggedAt = 0;

function normalizeSchedulerError(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("Authentication failed against database server")) {
    return "No fue posible autenticar contra PostgreSQL. Revisa DATABASE_URL/DIRECT_URL o conecta Supabase antes de arrancar el scheduler.";
  }

  if (message.includes("Can't reach database server")) {
    return "No fue posible conectar con PostgreSQL. Verifica que la base este encendida o que la URL de Supabase sea correcta.";
  }

  return message;
}

async function tick() {
  try {
    const result = await processScheduledAnnouncements({ source: "worker" });
    lastLoggedError = "";
    lastLoggedAt = 0;

    console.log("[scheduler] tick summary", {
      dueCount: result.dueCount,
      processedCount: result.processedCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      blockedCount: result.blockedCount,
      simulatedCount: result.simulatedCount,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    const message = normalizeSchedulerError(error);
    const now = Date.now();
    const shouldLogAgain = message !== lastLoggedError || now - lastLoggedAt > 60_000;

    if (shouldLogAgain) {
      console.error(`[scheduler] ${message}`);
      lastLoggedError = message;
      lastLoggedAt = now;
    }
  }
}

console.log("[scheduler] started", {
  enabled: isSchedulerEnabled(),
  intervalSeconds: POLL_INTERVAL_MS / 1000,
});

let interval: NodeJS.Timeout;

if (isSchedulerEnabled()) {
  void tick();
  interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
} else {
  interval = setInterval(() => {
    console.log("[scheduler] disabled by SCHEDULER_ENABLED=false");
  }, 60_000);
}

function shutdown(signal: string) {
  console.log(`[scheduler] Deteniendo worker por senal ${signal}.`);
  clearInterval(interval);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
