# Implementacion denuncias y reportes ciudadanos

## 1. Que se agrego

Se agrego un modulo para recibir, clasificar y administrar denuncias o reportes
ciudadanos enviados por WhatsApp. El flujo cubre texto e imagen con caption:

```text
WhatsApp -> UltraMsg -> /api/webhook -> deteccion de reporte -> Prisma/fallback -> panel admin
```

El sistema confirma al ciudadano la recepcion, pero no publica ni envia mensajes
masivos sin revision humana.

## 2. Archivos creados

- `src/server/citizen-report-service.ts`
- `src/components/modules/citizen-reports-manager.tsx`
- `src/app/dashboard/denuncias/page.tsx`
- `src/app/api/admin/citizen-reports/route.ts`
- `src/app/api/admin/citizen-reports/[id]/route.ts`
- `src/app/api/admin/citizen-reports/[id]/convert-to-mass-message/route.ts`
- `IMPLEMENTACION_DENUNCIAS_REPORTES_CIUDADANOS.md`

## 3. Archivos modificados

- `prisma/schema.prisma`
- `src/lib/types.ts`
- `src/app/api/ultramsg/webhook/route.ts`
- `src/components/layout/app-shell.tsx`
- `src/app/dashboard/page.tsx`
- `src/components/dashboard/dashboard-overview.tsx`

## 4. Flujo desde WhatsApp

1. UltraMsg llama `POST /api/webhook`.
2. El webhook parsea el mensaje como antes.
3. Antes de llamar al asistente normal, se revisa si el texto parece denuncia,
   reporte, alerta o caso de transito.
4. Si coincide, se crea un `CitizenReport`.
5. El ciudadano recibe confirmacion.
6. El reporte aparece en `/dashboard/denuncias`.

El bot normal sigue funcionando para mensajes que no parecen reportes.

## 5. Panel admin

La ruta nueva es:

```text
/dashboard/denuncias
```

Permite:

- Ver reportes recientes.
- Filtrar por estado.
- Buscar por descripcion, ubicacion o telefono.
- Ver detalle.
- Ver imagenes si UltraMsg entrega una URL.
- Cambiar estado.
- Guardar notas internas.
- Convertir en borrador de comunicado masivo.

## 6. Notificacion visual

Se agrego:

- Badge con contador en el menu lateral.
- Banner en el dashboard principal cuando hay reportes pendientes.
- Polling cada 30 segundos desde el menu para actualizar el contador.

No se implementaron WebSockets.

## 7. Imagenes

UltraMsg puede enviar imagen en claves como:

```text
media, mediaUrl, media_url, downloadUrl, download_url, url, file, image, body
```

La implementacion guarda solo URL y metadata si la imagen viene como URL HTTP/HTTPS
y parece ser `jpg`, `jpeg`, `png` o `webp`.

No se guarda base64 pesado en Prisma.

Limitacion actual: no hay storage persistente conectado. Si UltraMsg entrega base64
o una URL temporal que expire, hace falta conectar Cloudinary, S3, Supabase Storage
u otro almacenamiento persistente para conservar la imagen.

## 8. Conversion a alerta masiva

El boton `Convertir en alerta masiva` crea un comunicado programado a futuro con
contenido sugerido.

Importante:

- No se envia automaticamente.
- Queda para revision y edicion del admin.
- El reporte cambia a `converted_to_mass_message`.
- Se guarda `massMessageId`.

Como el modelo actual de comunicados no tiene estado `DRAFT`, se crea como
`SCHEDULED` con fecha futura, para evitar envio automatico inmediato.

## 9. Probar texto

Enviar desde WhatsApp:

```text
DENUNCIA: carro mal parqueado bloqueando la entrada del hospital
```

Resultado esperado:

- El ciudadano recibe confirmacion.
- Render muestra `[citizen-reports] report created`.
- El reporte aparece en `/dashboard/denuncias`.

## 10. Probar reporte de transito

```text
REPORTE: accidente de transito en la via Llanogrande
```

Resultado esperado:

- Categoria `Accidente`.
- Prioridad `urgent`.
- Aparece en el panel admin.

## 11. Probar imagen con caption

Enviar una imagen con caption:

```text
Alerta: semaforo dañado cerca al parque principal
```

Resultado esperado:

- Se crea reporte.
- Se asocia la imagen si UltraMsg entrega URL util.
- Aparece miniatura/enlace en el panel.

## 12. Probar imagen sin caption

Enviar una imagen sin texto.

Resultado esperado:

```text
Recibimos la imagen. Por favor envianos una breve descripcion de lo que sucedio y la ubicacion para crear el reporte correctamente.
```

No se crea un reporte incompleto.

## 13. Probar en Render

Despues de desplegar:

```bash
curl -X POST "https://ia-rionegrowhatsapp.onrender.com/api/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"message_received","instanceId":"instance177604","data":{"id":"report-test-001","from":"573001330213@c.us","body":"DENUNCIA: carro mal parqueado bloqueando la entrada del hospital","type":"chat","fromMe":false}}'
```

Luego abrir:

```text
https://ia-rionegrowhatsapp.onrender.com/dashboard/denuncias
```

## 14. Revisar UltraMsg

- Webhook on Received = ON
- Webhook Download Media = ON
- Webhook on Create = OFF
- Webhook on ACK = OFF
- Webhook On Reaction = OFF
- URL = `https://ia-rionegrowhatsapp.onrender.com/api/webhook`

## 15. Variables nuevas

No se agregaron variables nuevas obligatorias.

Para imagen persistente falta configurar un storage externo si se quiere conservar
archivos que lleguen como base64 o URLs temporales.

## 16. Seguridad y privacidad

- Los reportes no se publican automaticamente.
- Los mensajes masivos no se envian automaticamente.
- El telefono solo se muestra en admin.
- Se deduplica por `whatsappMessageId`.
- No se guardan imagenes base64 grandes en base de datos.
- Se validan tipos de imagen permitidos.
- No se loguean tokens ni API keys.

## 17. Logs esperados

```text
[citizen-reports] detected whatsapp report
[citizen-reports] image detected
[citizen-reports] report created
[citizen-reports] duplicate skipped
[citizen-reports] admin list loaded
[citizen-reports] converted to mass message draft
```

## 18. Migracion Prisma

En Render o local:

```bash
npx prisma generate
npx prisma db push
```

Si se usa el build recomendado:

```bash
npm install && npx prisma generate && npx prisma db push && npm run build
```
