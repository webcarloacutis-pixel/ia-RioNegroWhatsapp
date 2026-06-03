# Seguridad Operativa

Este panel aplica varias capas de seguridad sin cambiar los flujos principales de login, dashboard, APIs, webhook de WhatsApp, base de conocimiento y reportes.

## Variables Recomendadas

- `SESSION_SECRET`: secreto largo y aleatorio para firmar la cookie administrativa. Si falta, el sistema usa un secreto efimero por proceso y muestra una advertencia.
- `RATE_LIMIT_ENABLED`: usa `true` por defecto. Permite desactivar temporalmente rate limits con `false`.
- `ULTRAMSG_WEBHOOK_SECRET`: secreto opcional del webhook. Si esta vacio, el webhook mantiene compatibilidad. Si se configura, UltraMsg debe enviarlo en `x-ultramsg-webhook-secret`, `x-webhook-secret`, `Authorization: Bearer ...` o query `secret`.
- `MASS_MESSAGE_MAX_RECIPIENTS`: maximo de destinatarios permitidos para un envio real proactivo. Por defecto: `100`.

## Capas Implementadas

- Sesion admin firmada con HMAC, expiracion de 12 horas y compatibilidad temporal con la cookie legacy.
- Rate limit de login por IP: 5 intentos cada 15 minutos.
- `/api/debug/*` protegido por sesion administrativa y middleware.
- Middleware para `/dashboard/*` y `/api/debug/*`.
- Secreto opcional para webhook UltraMsg.
- Validacion de `Content-Type` y limites de body para APIs JSON y webhook.
- Rate limit por IP para webhook UltraMsg.
- Headers globales: CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Defensa local y en prompt contra solicitudes de revelar instrucciones internas, prompts, tokens o configuracion.
- URLs de imagen y medios bloquean localhost/redes privadas, y descargas de medios tienen limite de 10 MB.
- Reportes ciudadanos solo guardan imagenes publicas HTTP(S) con MIME permitido: JPEG, PNG o WebP.
- Envios masivos reales requieren destinatarios explicitos y respetan `MASS_MESSAGE_MAX_RECIPIENTS`.

## Notas Para UltraMsg

Configura el webhook en:

- `https://tu-dominio.com/api/ultramsg/webhook`
- Ruta compatible: `https://tu-dominio.com/api/webhook`

Si defines `ULTRAMSG_WEBHOOK_SECRET`, agrega el mismo valor en UltraMsg como header personalizado si el plan/interfaz lo permite. Si no, usa query string `?secret=...` en la URL del webhook.

## Validacion Local

Comandos usados para verificar:

```bash
npm run test:unit
npm run build
```
