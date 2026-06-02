import { promises as fs } from "node:fs";
import path from "node:path";

import { buildQaSnapshot } from "@/server/qa-service";

function statusLabel(status: string) {
  if (status === "ok") return "OK";
  if (status === "warning") return "Parcial";
  return "Falla";
}

async function main() {
  const snapshot = await buildQaSnapshot();
  const rows = snapshot.modules
    .map((item) =>
      [
        item.module,
        statusLabel(item.status),
        item.status === "fail" ? "Alto" : item.status === "warning" ? "Medio" : "Bajo",
        item.details.replace(/\|/g, "/"),
        item.status === "ok" ? "Monitoreo continuo" : "Revisar diagnostico y logs",
        "/dashboard/estado-sistema",
      ].join(" | "),
    )
    .join("\n");

  const content = `# APP STATUS REPORT

Generado: ${snapshot.generatedAt}

## Resumen

- Modulos OK: ${snapshot.summary.ok}/${snapshot.summary.totalModules}
- Modulos en atencion: ${snapshot.summary.warning}
- Modulos en falla: ${snapshot.summary.fail}
- Tasa de exito: ${snapshot.summary.successRate}%
- Tasa de error: ${snapshot.summary.errorRate}%

## Estado por modulo

Modulo | Estado | Riesgo | Evidencia | Que falta | Como probar
--- | --- | --- | --- | --- | ---
${rows}

## Rutas 200 esperadas

- GET /api/health
- GET /api/debug/env
- GET /api/debug/webhook
- GET /api/debug/routes
- GET /api/debug/db
- GET /api/debug/ultramsg
- GET /api/debug/announcements
- GET /api/debug/citizen-reports

## Rutas admin que pueden responder 401

- GET /api/dashboard
- GET /api/metrics
- GET /api/announcements
- POST /api/announcements
- POST /api/announcements/[id]/send
- GET /api/admin/citizen-reports

## Rutas que pueden responder 400

- POST /api/auth/login con payload invalido.
- POST /api/announcements con titulo, mensaje, tipo o fecha invalidos.
- PATCH /api/announcements/[id] con payload invalido.
- POST /api/assistant/chat sin sessionId o message.
- PATCH /api/admin/citizen-reports/[id] con estado invalido.
- POST /api/webhook con payload vacio puede responder ok con ignored.

## Rutas con riesgo 500/520

- /dashboard si una Server Component recibe datos inesperados.
- /dashboard/metricas si una grafica se monta con contenedor colapsado.
- /api/announcements/[id]/send si no hay destinatarios ni dry-run.
- /api/scheduler/run si DB o envio fallan.
- /api/admin/citizen-reports si faltan tablas Prisma.
- /api/assistant/chat si proveedor externo o fallback falla.

## Endpoints que dependen de DB

- /api/dashboard
- /api/metrics
- /api/announcements
- /api/segments
- /api/knowledge
- /api/admin/citizen-reports
- /api/debug/db
- /api/debug/announcements
- /api/debug/citizen-reports

## Endpoints que deben tener fallback

- /api/dashboard
- /api/metrics
- /api/announcements
- /api/admin/citizen-reports
- /dashboard/conversaciones
- /dashboard/asistente

## Causas probables si un comunicado no se envia

- WHATSAPP_SAFE_MODE=true bloquea envios proactivos reales.
- WHATSAPP_DRY_RUN=true o SIMULATION_MODE=true simulan UltraMsg.
- No hay ULTRAMSG_DEFAULT_TO ni segmentos con recipientPhones.
- El comunicado quedo SCHEDULED y no se ejecuto /send ni el scheduler.
- El worker de Render rionegro-panel-scheduler no esta activo.
- Prisma fallo o faltan tablas.
- Faltan ULTRAMSG_TOKEN, ULTRAMSG_BASE_URL o ULTRAMSG_INSTANCE_ID.

## Checklist de variables

- DATABASE_URL
- DIRECT_URL
- ADMIN_EMAIL
- ADMIN_PASSWORD
- ULTRAMSG_TOKEN
- ULTRAMSG_INSTANCE_ID
- ULTRAMSG_BASE_URL
- ULTRAMSG_DEFAULT_TO o segmentos con telefonos
- OPENAI_API_KEY
- ELEVENLABS_API_KEY
- ELEVENLABS_VOICE_ID
- WHATSAPP_SAFE_MODE
- WHATSAPP_DRY_RUN
- SIMULATION_MODE
`;

  await fs.writeFile(path.join(process.cwd(), "APP_STATUS_REPORT.md"), content, "utf8");
  console.log("APP_STATUS_REPORT.md generado.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
