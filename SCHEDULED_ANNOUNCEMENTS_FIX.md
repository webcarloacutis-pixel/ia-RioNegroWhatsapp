# Correccion de envios programados de comunicados

## Que estaba fallando

El envio programado podia quedar sin ejecutar si el worker `rionegro-panel-scheduler` de Render no estaba activo, si `WHATSAPP_SAFE_MODE=true` bloqueaba envios reales, o si el comunicado no tenia destinatarios en el segmento ni `ULTRAMSG_DEFAULT_TO`.

Tambien existia riesgo de doble envio cuando se combinaban worker, endpoint manual y cron, porque no habia un estado intermedio de lock antes de enviar.

## Como funciona ahora

El scheduler busca comunicados con:

```text
status = SCHEDULED
scheduledAt <= now
```

Antes de enviar, intenta mover el comunicado atomicamente a `SENDING`. Si otro proceso ya lo tomo, lo salta y lo cuenta como `skipped`.

Los estados finales son:

```text
SENT_REAL
SENT_SIMULATED
BLOCKED_BY_SAFE_MODE
FAILED
```

Si faltan destinatarios, queda `FAILED` y el `DeliveryLog` contiene `NO_RECIPIENTS`.

`SENT_REAL` solo se marca cuando UltraMsg devuelve una senal positiva de envio, como `sent=true`, `success`, `ok`, `queued` o un identificador de mensaje. Si UltraMsg responde con `sent=false`, `status=false`, `error` o no confirma el envio, el comunicado queda `FAILED`.

## Worker de Render

El worker `rionegro-panel-scheduler` es importante porque procesa la cola aunque nadie tenga abierto el dashboard.

Para verificarlo en Render:

1. Entra a Render.
2. Abre el servicio `rionegro-panel-scheduler`.
3. Confirma que este `Live`.
4. Revisa logs con entradas `[scheduler] started`, `[scheduler] tick` y `[scheduler] completed`.

## Cron de Render

Configura estas variables en Render Environment:

```env
CRON_SECRET=un-secreto-largo
SCHEDULER_ENABLED=true
SCHEDULER_INTERVAL_SECONDS=15
```

No pongas `CRON_SECRET` en GitHub.

URL del cron:

```text
https://TU_DOMINIO.onrender.com/api/cron/process-scheduled-announcements?secret=CRON_SECRET
```

Frecuencia recomendada: cada 1 o 5 minutos.

## Variables para envio real

Para produccion revisa:

```env
WHATSAPP_SAFE_MODE=false
WHATSAPP_DRY_RUN=false
ULTRAMSG_MOCK=false
ULTRAMSG_DEFAULT_TO=+573108853158
CRON_SECRET=...
SCHEDULER_ENABLED=true
```

`ULTRAMSG_DEFAULT_TO` puede usarse como destinatario de prueba para Cobertura general. Tambien puedes crear un segmento con numeros reales y elegir ese segmento al crear el comunicado.

Cobertura general no crea una lista masiva automaticamente. Para enviar a muchas personas debes cargar esos numeros en un segmento y seleccionar ese segmento en el comunicado.

## Como probar manualmente

1. Entra al dashboard.
2. Ve a `Comunicados`.
3. Crea un comunicado con texto, imagen o audio.
4. Programa una fecha/hora vencida o cercana.
5. Elige un segmento con numeros o configura `ULTRAMSG_DEFAULT_TO`.
6. Ve a `Programador`.
7. Presiona `Procesar programados ahora`.

Tambien puedes probar el cron:

```bash
curl "https://TU_DOMINIO.onrender.com/api/cron/process-scheduled-announcements?secret=TU_SECRET"
```

## Como leer logs

Logs esperados:

```text
[scheduler] started
[scheduler] tick
[scheduler] due announcements found
[scheduler] announcement locked
[scheduler] announcement sending
[scheduler] recipients loaded
[scheduler] no recipients
[scheduler] blocked by safe mode
[scheduler] dry-run simulated
[scheduler] sent real
[scheduler] failed
[scheduler] completed
```

Fechas de comunicados:

```text
[announcements] scheduledAt utc
[announcements] scheduledAt bogota
```

## Safe-mode y destinatarios

Si safe-mode bloquea:

```text
No se envio real porque WHATSAPP_SAFE_MODE esta activo.
```

Si faltan destinatarios:

```text
NO_RECIPIENTS: No se envio porque no hay destinatarios en el segmento ni ULTRAMSG_DEFAULT_TO.
```

## Como evitar doble envio

El lock usa una transicion atomica:

```text
SCHEDULED -> SENDING -> estado final
```

Solo el proceso que logra mover el comunicado a `SENDING` puede enviarlo. Los demas procesos lo cuentan como `skipped`.

## Endpoints

```text
GET  /api/admin/scheduler/status
POST /api/admin/scheduler/run
GET  /api/cron/process-scheduled-announcements?secret=CRON_SECRET
```

Los endpoints admin requieren sesion. El endpoint cron requiere `CRON_SECRET`.
