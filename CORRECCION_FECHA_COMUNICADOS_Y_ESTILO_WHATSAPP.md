# Correccion de fecha/hora, comunicados y estilo WhatsApp

## 1. Causa del desfase de hora

El formulario de comunicados usa `datetime-local`, que entrega valores sin zona horaria, por ejemplo `2026-06-02T10:22`.

Antes el backend interpretaba ese string con `new Date(value)`. En Render o servidores configurados en UTC, esa hora podia tratarse como UTC y luego verse en Colombia cinco horas antes.

## 2. Correccion con America/Bogota

Se agrego `BOGOTA_TIME_ZONE = "America/Bogota"` y conversion explicita:

- `2026-06-02T10:22` se interpreta como hora civil de Colombia.
- Se guarda como `2026-06-02T15:22:00.000Z`.
- El dashboard vuelve a mostrar `10:22`.
- El input de edicion vuelve a recibir `2026-06-02T10:22`.

Colombia no maneja horario de verano, asi que se usa offset fijo `-05:00` para interpretar el valor de `datetime-local`.

## 3. Como probar fecha/hora

Crear un comunicado con fecha `2026-06-02` y hora `10:22`.

Verificar:

- En base de datos debe quedar como `2026-06-02T15:22:00.000Z`.
- En el dashboard debe verse como `10:22 a. m.` en Colombia.
- Al editar, el input debe mostrar `2026-06-02T10:22`.
- En Render debe conservar la misma hora visible aunque el servidor ejecute en UTC.

Tambien se agrego `TZ=America/Bogota` en `render.yaml` y `.env.example` para logs y formatos secundarios.

## 4. Envio real vs simulado

Se extendio `AnnouncementStatus` manteniendo `SENT` como valor legacy:

- `DRAFT`
- `SCHEDULED`
- `SENT`
- `SENT_REAL`
- `SENT_SIMULATED`
- `BLOCKED_BY_SAFE_MODE`
- `FAILED`

Los envios reales por UltraMsg quedan como `SENT_REAL`.

Los envios en `WHATSAPP_DRY_RUN=true`, `ULTRAMSG_MOCK=true` o simulaciones quedan como simulados.

Los envios bloqueados por `WHATSAPP_SAFE_MODE=true` quedan como `BLOCKED_BY_SAFE_MODE` y no se marcan como envio real.

## 5. WHATSAPP_SAFE_MODE

`WHATSAPP_SAFE_MODE=true` permite respuestas inbound seguras, pero bloquea comunicados proactivos reales.

Cuando un admin intenta enviar un comunicado con safe mode activo:

- No se llama envio real proactivo.
- Se registra log con `[BLOCKED_BY_SAFE_MODE]`.
- El comunicado queda con estado `BLOCKED_BY_SAFE_MODE`.

## 6. Como probar comunicados

Pruebas locales sin enviar real:

```bash
npm run test:unit
```

Prueba manual segura:

```env
WHATSAPP_SAFE_MODE=true
WHATSAPP_DRY_RUN=false
```

Enviar un comunicado desde el panel. Debe quedar como bloqueado por modo seguro.

Prueba dry-run:

```env
WHATSAPP_SAFE_MODE=false
WHATSAPP_DRY_RUN=true
```

Enviar un comunicado. Debe quedar como simulado, no como real.

Prueba sin destinatarios:

- Quitar `ULTRAMSG_DEFAULT_TO`.
- Usar un segmento sin telefonos.
- Enviar comunicado.

Debe mostrar error claro de destinatarios.

## 7. Cambios en estilo del bot

Se agrego una capa final de tono WhatsApp:

- Respuestas simples en 2 o 3 parrafos cortos.
- Sin bullets cuando no hacen falta.
- Agradecimientos responden `Con mucho gusto.`
- Saludos responden corto.
- Ubicacion de Alcaldia responde directo con direccion y recomendacion breve.
- Predial responde con orientacion especifica de Hacienda/Rentas, no una lista generica.

El prompt OpenAI tambien fue reforzado para evitar tono de informe.

## 8. Como probar respuestas naturales

Probar en el laboratorio del asistente o por WhatsApp:

- `Donde queda la Alcaldia?`
- `Gracias`
- `Hola`
- `Necesito pagar el predial`
- `Hay un accidente en Llanogrande`
- `Se cayo un arbol via Ojos de Agua`

Las preguntas simples no deben traer listas ni texto institucional largo.

Los reportes ciudadanos deben guardarse como reportes y no caer al asistente general.

## 9. Direccion configurada

La fuente unica configurada es:

```text
Carrera 50 # 49 - 05
```

Queda en `ALCALDIA_RIONEGRO_ADDRESS`.

Limitacion: esta direccion se tomo de la base local existente del proyecto. Debe validarse contra fuente oficial antes de cambiarla por otra direccion.

## 10. Limitaciones pendientes

- Comunicados antiguos pueden tener `scheduledAt` ya guardado con desfase. Esos registros deben revisarse antes de corregirlos masivamente.
- `SENT` queda como estado legacy para datos viejos.
- Para despliegue con Prisma, Render debe ejecutar `prisma db push` o migracion equivalente para agregar los nuevos valores del enum.
- La capa de tono evita respuestas largas en consultas simples, pero las consultas complejas pueden seguir usando listas cuando tiene sentido.

## Logs utiles

Buscar en Render:

```text
[announcements] send requested
[announcements] recipients loaded
[announcements] blocked by safe mode
[announcements] dry-run simulated
[announcements] ultramsg sending
[announcements] sent real
[announcements] failed
[announcements] no recipients
```
