# Logging seguro y diagnostico

## Que se agrego

Se agrego un logger central en:

```text
src/lib/logger.ts
```

Incluye:

```text
logger.debug
logger.info
logger.warn
logger.error
maskSecret
maskPhone
maskEmail
sanitizeLogPayload
sanitizeError
classifyPrismaError
```

Cada log incluye timestamp, nivel, modulo, mensaje, ambiente, requestId cuando existe y metadata sanitizada.

## Datos que nunca se loguean completos

```text
tokens
API keys
passwords
SESSION_SECRET
CRON_SECRET
DATABASE_URL completa
cookies
autorizaciones
numeros de telefono completos
emails completos
mensajes privados largos en produccion
base64 de audios o imagenes
```

Los telefonos se muestran como:

```text
+57******0213
```

Los emails se muestran como:

```text
a***n@rionegro.gov
```

## Variables de logging

```env
LOG_LEVEL=info
LOG_DEBUG=false
LOG_SAFE_MODE=true
```

En produccion, `debug` no imprime salvo que `LOG_DEBUG=true`.

## RequestId

Las APIs envueltas con logging aceptan `x-request-id`. Si no llega, generan uno.

Las respuestas de error incluyen:

```json
{
  "ok": false,
  "error": "Mensaje seguro",
  "requestId": "..."
}
```

Ese `requestId` debe buscarse en Render Logs para encontrar el evento exacto.

## Diagnosticar base de conocimiento demo

Si el panel muestra datos demo en `/dashboard/base-conocimiento`, revisar:

```text
[knowledge] prisma query failed
[dashboard] using fallback demo data
```

El log clasifica errores Prisma como:

```text
DATABASE_CONNECTION_FAILED
TABLE_NOT_FOUND
COLUMN_NOT_FOUND
ENV_MISSING
PRISMA_ERROR
```

Si aparece `TABLE_NOT_FOUND` o `COLUMN_NOT_FOUND`, normalmente falta:

```bash
npx prisma db push
```

En Render, el script `build:render` ya ejecuta `npx prisma db push`.

## Endpoints nuevos

```text
GET /api/admin/system/env-check
GET /api/admin/system/db-check
```

Ambos requieren sesion admin.

`env-check` muestra solo booleanos, nunca valores.

`db-check` hace `SELECT 1` y valida tablas principales:

```text
Announcement
Segment
DeliveryLog
KnowledgeBaseEntry
CitizenReport
SchedulerRun
```

## Dashboard de diagnostico

Ruta:

```text
/dashboard/diagnostico
```

Muestra:

```text
estado DB
estado variables
tablas principales
ultimos logs seguros en memoria
botones para probar DB y variables
requestId de checks recientes
```

## Scheduler y cron

Los endpoints de scheduler y cron registran requestId, estado de autenticacion y resultado del procesamiento sin imprimir secretos.

Para cron:

```text
/api/cron/process-scheduled-announcements
```

Si falla auth, el log indica si el secreto vino por header o query, pero no muestra el secreto.

## UltraMsg

Los logs indican:

```text
send text started
send image started
send audio started
send success
send failed
safe mode blocked
dry-run simulated
```

No se imprime token ni cuerpo completo del proveedor. Los destinatarios se enmascaran.

## Cloudinary

Los uploads registran:

```text
tipo de archivo
tamano
provider
folder
publicId parcial
```

No se imprime secret, base64 ni archivo completo.

## Frontend

El panel de conocimiento usa `clientLogger` para registrar:

```text
[client:knowledge] loading
[client:knowledge] request failed
[client:knowledge] fallback demo shown
```

Si una API falla, el toast y el log del navegador incluyen `requestId`.

## Recharts

Se ajustaron contenedores de `ResponsiveContainer` para usar alto/ancho estables y evitar warnings de `width(-1)` o `height(-1)`.

## Como revisar Render Logs

1. Abrir Render.
2. Ir al servicio web.
3. Entrar a Logs.
4. Buscar el `requestId` mostrado en el dashboard o respuesta de API.
5. Revisar el modulo:

```text
knowledge
dashboard
db
env
scheduler
cron
ultramsg
uploads
security
```

## Pruebas

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```
