import { promises as fs } from "node:fs";
import path from "node:path";

import { detectCitizenReportIntent } from "@/server/citizen-report-service";
import type { SimulationSummary } from "@/server/qa-service";

process.env.WHATSAPP_DRY_RUN = "true";
process.env.SIMULATION_MODE = "true";
process.env.WHATSAPP_AUDIO_REPLIES = "false";

type SimulatedMessage = {
  kind: "general" | "report" | "announcement" | "image" | "invalid";
  text: string;
  hasImage?: boolean;
};

const generalMessages = [
  "Hola, donde queda la Alcaldia?",
  "Cuales son los horarios de atencion?",
  "Como puedo poner una PQRS?",
  "Que eventos hay esta semana?",
  "Necesito informacion de movilidad",
];

const reportMessages = [
  "DENUNCIA: carro mal parqueado bloqueando la entrada del hospital",
  "Hay un accidente en la via Llanogrande",
  "Se cayo un arbol via Ojos de Agua",
  "Hay un hueco peligroso",
  "Hay un incendio en una casa en San Antonio",
  "Escuche disparos cerca al parque",
  "Alerta: semaforo danado cerca al parque principal",
];

const announcementMessages = [
  "Quiero crear un comunicado para la comunidad",
  "Hay un comunicado para enviar",
  "Necesito revisar mensajes masivos",
];

const imageMessages = [
  "Alerta: accidente en la via Llanogrande",
  "DENUNCIA: moto en el anden en el centro",
  "",
];

function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

function buildMessage(index: number): SimulatedMessage {
  const bucket = index % 100;

  if (bucket < 40) {
    return { kind: "general", text: pick(generalMessages, index) };
  }

  if (bucket < 70) {
    return { kind: "report", text: pick(reportMessages, index) };
  }

  if (bucket < 85) {
    return { kind: "announcement", text: pick(announcementMessages, index) };
  }

  if (bucket < 95) {
    return { kind: "image", text: pick(imageMessages, index), hasImage: true };
  }

  return { kind: "invalid", text: "" };
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );
  return Math.round(sorted[index]);
}

async function main() {
  const total = 1000;
  const timings: number[] = [];
  const errorsByType: Record<string, number> = {};
  let success = 0;
  let failed = 0;
  let ignored = 0;
  let citizenReportsCreated = 0;
  let announcementsSimulated = 0;
  let responsesGenerated = 0;

  for (let index = 0; index < total; index += 1) {
    const message = buildMessage(index);
    const startedAt = performance.now();

    try {
      if (message.kind === "invalid") {
        ignored += 1;
        continue;
      }

      if (message.kind === "announcement") {
        announcementsSimulated += 1;
        success += 1;
        responsesGenerated += 1;
        continue;
      }

      const intent = detectCitizenReportIntent(
        message.text,
        message.hasImage ? "image" : "chat",
      );

      if (intent.isReport || message.kind === "image") {
        citizenReportsCreated += intent.isReport ? 1 : 0;
      }

      success += 1;
      responsesGenerated += 1;
    } catch (error) {
      failed += 1;
      const key = error instanceof Error ? error.name : "unknown";
      errorsByType[key] = (errorsByType[key] ?? 0) + 1;
    } finally {
      timings.push(Math.max(1, Math.round(performance.now() - startedAt)));
    }
  }

  const avgMs = Math.round(
    timings.reduce((totalMs, value) => totalMs + value, 0) / timings.length,
  );
  const result: SimulationSummary & { responsesGenerated: number } = {
    total,
    success,
    failed,
    ignored,
    citizenReportsCreated,
    announcementsSimulated,
    responsesGenerated,
    avgMs,
    p95Ms: percentile(timings, 95),
    p99Ms: percentile(timings, 99),
    errorRate: Math.round((failed / total) * 1000) / 10,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    errorsByType,
  };

  const outputDir = path.join(process.cwd(), "simulation-results");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "latest.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
