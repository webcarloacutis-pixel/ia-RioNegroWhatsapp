# APP STATUS REPORT

Generado: 2026-06-02T03:33:18.975Z

## Resumen

- Modulos OK: 6/12
- Modulos en atencion: 3
- Modulos en falla: 3
- Tasa de exito: 50%
- Tasa de error: 25%

## Estado por modulo

Modulo | Estado | Riesgo | Evidencia | Que falta | Como probar
--- | --- | --- | --- | --- | ---
Auth | OK | Bajo | Login por cookie httpOnly; no depende de Prisma. | Monitoreo continuo | /dashboard/estado-sistema
Dashboard | Parcial | Medio | Debe mostrar fallback si Prisma falla. | Revisar diagnostico y logs | /dashboard/estado-sistema
Comunicados | Falla | Alto | Invalid `prisma.announcement.count()` invocation in [local-path] 262 try { 263 const [scheduled, sent, failedLogs, demoLogs, manualLogs, segmentsWithRecipients, due] = 264 await Promise.all([ → 265 prisma.announcement.count( Server has clos | Revisar diagnostico y logs | /dashboard/estado-sistema
Envio WhatsApp | Parcial | Medio | UltraMsg configurado, pero safe mode bloquea envios proactivos reales. | Revisar diagnostico y logs | /dashboard/estado-sistema
UltraMsg webhook | OK | Bajo | Webhook publico activo en /api/webhook y /api/ultramsg/webhook. | Monitoreo continuo | /dashboard/estado-sistema
Denuncias ciudadanas | Falla | Alto | Invalid `prisma.citizenReport.count()` invocation in [local-path] 325 326 try { 327 const [total, pending, urgent, withImages] = await Promise.all([ → 328 prisma.citizenReport.count( Server has closed the connection. | Revisar diagnostico y logs | /dashboard/estado-sistema
Conversaciones | Parcial | Medio | Depende de AssistantQueryLog con fallback en memoria. | Revisar diagnostico y logs | /dashboard/estado-sistema
Asistente IA | OK | Bajo | OpenAI en modo mock seguro. | Monitoreo continuo | /dashboard/estado-sistema
Prisma DB | Falla | Alto | Invalid `prisma.$queryRaw()` invocation: Server has closed the connection. | Revisar diagnostico y logs | /dashboard/estado-sistema
OpenAI | OK | Bajo | OPENAI_MOCK/SIMULATION_MODE activo; no se consumen creditos. | Monitoreo continuo | /dashboard/estado-sistema
ElevenLabs | OK | Bajo | ELEVENLABS_MOCK/SIMULATION_MODE activo; no se genera audio real. | Monitoreo continuo | /dashboard/estado-sistema
Render runtime | OK | Bajo | NODE_ENV=undefined; dryRun=true | Monitoreo continuo | /dashboard/estado-sistema

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
- OPENAI_MOCK
- ELEVENLABS_API_KEY
- ELEVENLABS_VOICE_ID
- ELEVENLABS_MOCK
- WHATSAPP_SAFE_MODE
- WHATSAPP_DRY_RUN
- ULTRAMSG_MOCK
- SIMULATION_MODE
