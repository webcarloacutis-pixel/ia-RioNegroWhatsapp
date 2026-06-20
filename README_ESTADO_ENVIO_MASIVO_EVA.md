# Estado actual del envio masivo de Eva

Fecha de diagnostico: 2026-06-19

Este documento resume el estado operativo del panel de Rionegro, el problema observado con el envio masivo por WhatsApp y los cambios hechos para que otra IA o desarrollador pueda continuar con correcciones precisas.

## Resumen ejecutivo

Eva si esta enviando mensajes, pero el flujo actual no es una cola robusta de envios masivos. El boton "Enviar ahora" ejecuta el envio dentro de una peticion HTTP de Next.js y llama a UltraMsg destinatario por destinatario. Eso puede funcionar para bases pequenas, pero no es confiable para 1.000+ destinatarios y mucho menos para 154.000.

El problema observado tiene varias causas combinadas:

- El envio es secuencial: se espera la respuesta de UltraMsg antes de pasar al siguiente numero.
- El envio manual vive dentro de `/api/announcements/[id]/send`; si Render reinicia, despliega, corta la peticion o hay timeout, el proceso se puede interrumpir.
- Antes no habia estado durable por destinatario; si el proceso se cortaba a mitad, no habia forma exacta de saber que numeros fueron aceptados por UltraMsg y cuales quedaron pendientes.
- UltraMsg/WhatsApp puede aceptar mensajes en cola aunque la instancia este desconectada. La captura muestra la instancia pidiendo QR y una cola de miles de mensajes, por lo que "aceptado por API" no equivale necesariamente a "entregado por WhatsApp".
- El navegador mostro `ERR_INTERNET_DISCONNECTED`; eso puede cortar la experiencia del usuario, pero el problema principal esta del lado servidor/proveedor: el proceso largo no debe depender de una peticion web abierta.

## Evidencia recibida

Archivo adjunto revisado:

`C:\Users\sebas\.codex\attachments\8f169c91-9fb7-431c-99e6-2744d589d92c\pasted-text.txt`

Ese archivo contiene principalmente logs de build/deploy de Render:

- Build exitoso.
- Deploy exitoso.
- Servicio vivo en `https://ia-rionegrowhatsapp.onrender.com`.
- Arranque de Next.js.

El archivo no contiene trazas del envio masivo en si. Esto indica que, antes de esta instrumentacion, no habia suficiente logging para reconstruir el envio desde Render.

Capturas aportadas:

- DevTools reporta `400` y `ERR_INTERNET_DISCONNECTED`.
- UltraMsg muestra que la instancia debe autorizarse con QR y que hay mensajes en cola.

Interpretacion: el backend puede haber enviado llamadas a UltraMsg, UltraMsg pudo haberlas puesto en cola, pero la sesion WhatsApp de la SIM de Eva se desconecto y/o el proceso del servidor se interrumpio.

## Estado de la base y segmentos

Segmento usado para envios:

`Todos los rionegrenses`

Durante esta sesion se cargaron numeros y el contador llego a mas de 1.000 destinatarios. En el momento del incidente el usuario reporta alrededor de 1.022 destinatarios; despues se agrego otro lote y el contador local verificado llego a 1.055.

Nota de seguridad: no se deben imprimir ni commitear listados completos de telefonos. Los logs usan telefonos enmascarados.

## Cambios ya realizados

Commits subidos a `main`:

```text
82d325e Raise mass message recipient limit
4eba555 Enforce minimum mass message limit
```

Cambios principales:

- El limite de envios masivos reales ya no queda en 100.
- El minimo efectivo es 154.000 aunque Render tenga `MASS_MESSAGE_MAX_RECIPIENTS=100`.
- Si `MASS_MESSAGE_MAX_RECIPIENTS` se configura por encima de 154.000, se respeta el valor mas alto.
- Se redujo el riesgo de logs gigantes: no se guardan miles de telefonos completos en un solo `DeliveryLog`.
- El resultado del envio resume intentados, aceptados, fallidos, duracion y `runId`.

Cambios agregados en esta revision:

- Se agregan logs de inicio, progreso y cierre de envios masivos.
- Se agrega `runId` por ejecucion de envio para correlacionar Render logs.
- Se marca el comunicado como `SENDING` antes de iniciar el envio.
- Se evita construir un string gigante con todos los telefonos antes de enviar.
- Se registra si la respuesta de UltraMsg parece `queued`.
- Se agrega este README operativo.

## Logs nuevos que deben aparecer

Buscar en Render por estos mensajes:

```text
[messageService] mass send started
[messageService] mass send progress
[messageService] mass send completed
[messageService] mass send failed
[announcements] send requested
[announcements] recipients loaded
[announcements] send marked sending
[announcements] send completed
[announcements] send failed
[ultramsg] send success
```

Cada envio masivo tiene un `runId`. Ejemplo de campos esperados:

```json
{
  "runId": "...",
  "recipientCount": 1055,
  "attemptedCount": 200,
  "acceptedCount": 198,
  "failureCount": 2,
  "progressPercent": 19,
  "durationMs": 600000
}
```

UltraMsg success ahora incluye resumen de proveedor:

```json
{
  "providerResponse": {
    "status": "...",
    "providerMessage": "...",
    "hasProviderId": true,
    "queued": true,
    "keys": ["..."]
  }
}
```

Si `queued` aparece como `true`, significa que UltraMsg acepto el mensaje pero puede estar esperando que la instancia de WhatsApp vuelva a conectarse.

Variable util:

```env
MASS_MESSAGE_PROGRESS_LOG_EVERY=50
```

Por defecto se registra progreso cada 50 destinatarios. En diagnostico se puede bajar a 10, pero para 154.000 no conviene loguear cada destinatario porque Render se vuelve ruidoso y costoso de inspeccionar.

## Por que no funciono como se esperaba

La expectativa era: "presionar Enviar ahora y que se envie inmediatamente a todos".

La realidad tecnica actual:

1. El servidor toma el comunicado y el segmento.
2. Obtiene los telefonos del segmento.
3. Recorre la lista uno por uno.
4. Por cada telefono llama a UltraMsg.
5. Si UltraMsg responde OK/queued/sent, el sistema cuenta ese destinatario como aceptado.
6. Solo al terminar todo el ciclo se crea un `DeliveryLog` final y se marca el comunicado como `SENT_REAL`.

Problemas:

- Si Render reinicia antes del final, no se guarda el log final.
- Si UltraMsg se desconecta, los mensajes pueden quedar en cola.
- Si WhatsApp limita o bloquea temporalmente la SIM, la API puede empezar a fallar o encolar.
- Si la peticion web se corta, el usuario puede ver 400/502 o desconexion aunque algunos mensajes ya hayan sido enviados/encolados.
- No existe tabla `MessageRecipientDelivery` ni una cola durable por destinatario.

## Riesgo de enviar todo simultaneo

No se recomienda disparar 1.000 o 154.000 llamadas al mismo tiempo desde una sola SIM.

Riesgos:

- Bloqueo o limitacion de WhatsApp.
- Saturacion de UltraMsg.
- Miles de mensajes en cola.
- Perdida de trazabilidad.
- Timeouts y 502 en Render.
- La SIM de Eva puede quedar desconectada y pedir QR.

Lo correcto es una cola con concurrencia controlada.

## Diseno recomendado para correccion definitiva

Crear un sistema de envios por lotes:

1. Tabla `MassMessageRun`
   - id
   - announcementId
   - segmentId
   - status: pending/running/paused/completed/failed/cancelled
   - totalRecipients
   - attemptedCount
   - acceptedCount
   - failedCount
   - queuedCount
   - startedAt
   - completedAt
   - lastError

2. Tabla `MassMessageRecipient`
   - id
   - runId
   - phoneNumber
   - status: pending/sending/accepted/queued/failed/skipped
   - attempts
   - providerMessageId
   - providerStatus
   - lastError
   - sentAt
   - updatedAt

3. Worker de envio
   - Procesa pendientes por lotes.
   - Concurrencia configurable: por ejemplo 3 a 10 simultaneos.
   - Pausa si UltraMsg indica desconexion o demasiados errores.
   - Reintenta fallidos con backoff.
   - Puede continuar despues de redeploy/restart.

4. UI
   - Boton "Iniciar envio" crea un run y responde rapido.
   - Panel muestra progreso real: pendientes, aceptados, fallidos, en cola.
   - Botones: pausar, reanudar, cancelar, reintentar fallidos.

5. Integracion UltraMsg
   - Antes de iniciar un envio grande, consultar estado de instancia si hay endpoint disponible.
   - Si la instancia pide QR o esta desconectada, bloquear inicio y mostrar instruccion.
   - Diferenciar "accepted/queued" de "delivered".

## Pasos operativos inmediatos

Antes de enviar otro comunicado grande:

1. Revisar UltraMsg.
2. Si pide QR, escanearlo desde el celular de Eva.
3. Revisar la cola de UltraMsg.
4. No borrar la cola si todavia se quiere que esos mensajes pendientes salgan.
5. Esperar a que la instancia quede autorizada.
6. Revisar Render logs con `mass send progress`.
7. Buscar por `runId` para reconstruir el envio.

Si un comunicado queda en estado `SENDING` mucho tiempo:

- Probablemente el proceso fue cortado antes de terminar.
- Revisar Render logs alrededor de ese `runId`.
- Revisar si hubo deploy/restart.
- Revisar UltraMsg queue.
- Aun no hay reanudacion automatica por destinatario; se necesita la arquitectura de cola para eso.

## Comandos utiles para otra IA

Ver commits recientes:

```bash
git log -5 --oneline
```

Buscar flujo de envio:

```bash
rg -n "mass send|sendAnnouncementNowDb|sendMessageUltraMsg|sendWhatsAppText" src/server
```

Ejecutar pruebas del servicio:

```bash
npm run test:unit -- tests/server/message-service.test.ts
```

Ejecutar lint:

```bash
npm run lint
```

Ver estado de git:

```bash
git status --short
```

## Estado esperado despues de esta revision

Despues de desplegar estos cambios:

- Render logs deben mostrar progreso por `runId`.
- Un envio interrumpido debe dejar el comunicado en `SENDING` en vez de quedar completamente silencioso.
- El limite de 100 destinatarios ya no debe reaparecer.
- Los detalles del `DeliveryLog` deben incluir `RUN_ID`, intentados, aceptados, fallidos y duracion.
- Todavia no existe recuperacion exacta por destinatario; eso requiere las tablas y worker recomendados.

## Advertencia importante

El sistema actual puede aceptar mensajes masivos, pero todavia no garantiza entrega completa a todos los ciudadanos. La garantia real requiere cola durable, estado por destinatario, reintentos y control de conexion UltraMsg/WhatsApp.
