# Render production diagnostic

## Que estaba fallando

Render levantaba el servicio, pero el diagnostico real era incompleto:

- No existian endpoints dedicados para confirmar salud, variables y webhook.
- El panel podia caer en una pantalla generica de Server Components si Prisma fallaba.
- El webhook podia responder 500 a UltraMsg cuando fallaba OpenAI, ElevenLabs, Prisma indirecto o UltraMsg outbound.
- Render estaba usando `npm install; npm run build` y Node 24 en los logs, aunque el proyecto recomienda Node 20 y build con Prisma.

## Que se robustecio

- Health checks seguros: `/api/health`, `/api/debug/env`, `/api/debug/webhook`.
- Logs de auth: `[auth] login attempt`, `[auth] login success`, `[auth] session check`.
- Logs de dashboard: `[dashboard] loading data`, `[dashboard] using fallback data`.
- Webhook con respuesta 200 ante errores internos para evitar reintentos infinitos de UltraMsg.
- Fallback de asistente si Prisma/OpenAI fallan.
- Fallback a texto si ElevenLabs o envio de audio fallan.
- `package.json` declara Node 20 y agrega `postinstall`, `build:render` y `test:webhook`.

## Probar health

```bash
curl https://ia-rionegrowhatsapp.onrender.com/api/health
```

Debe devolver:

```json
{
  "ok": true,
  "service": "ia-rionegrowhatsapp"
}
```

## Probar variables sin secretos

```bash
curl https://ia-rionegrowhatsapp.onrender.com/api/debug/env
```

Debe mostrar `true` o strings de configuracion, nunca tokens ni API keys.

## Probar webhook debug

```bash
curl https://ia-rionegrowhatsapp.onrender.com/api/debug/webhook
```

Debe devolver `Webhook route is alive`.

## Probar login

1. Abrir `https://ia-rionegrowhatsapp.onrender.com/login`.
2. Entrar con:

```text
admin@rionegro.gov
admin123
```

3. Revisar logs:

```text
[auth] login attempt
[auth] login success
[auth] session check
```

## Probar dashboard

Despues del login:

```text
https://ia-rionegrowhatsapp.onrender.com/dashboard
```

Logs esperados:

```text
[dashboard] loading data
```

Si Prisma falla:

```text
[dashboard] using fallback data
```

## Probar webhook con curl

```bash
curl -X POST "https://ia-rionegrowhatsapp.onrender.com/api/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"message_received","instanceId":"instance177604","data":{"id":"test-message-001","from":"573001330213@c.us","body":"Hola","type":"chat","fromMe":false}}'
```

Debe responder 200. En logs:

```text
[whatsapp] webhook received
[whatsapp] inbound message
[whatsapp] inbound text
[assistant] reply generated
[ultramsg] sending text
```

Si falla algo interno, tambien debe responder 200 y registrar:

```text
[whatsapp] webhook error
```

## Probar con script npm

Local:

```bash
npm run dev:frontend
npm run test:webhook
```

Render desde PowerShell:

```powershell
$env:WEBHOOK_URL="https://ia-rionegrowhatsapp.onrender.com/api/webhook"; npm run test:webhook
```

Bash:

```bash
WEBHOOK_URL="https://ia-rionegrowhatsapp.onrender.com/api/webhook" npm run test:webhook
```

## Probar WhatsApp real

1. UltraMsg debe tener:

```text
https://ia-rionegrowhatsapp.onrender.com/api/webhook
```

2. Enviar un mensaje nuevo desde WhatsApp.
3. Logs esperados:

```text
[whatsapp] webhook received
[whatsapp] inbound message
[whatsapp] inbound text
[assistant] reply generated
[elevenlabs] audio generated
[ultramsg] sending audio
[ultramsg] reply sent
```

Si ElevenLabs falla:

```text
[elevenlabs] error generating audio, falling back to text
[ultramsg] sending text
```

## Revisar UltraMsg

- Webhook on Received = ON
- Webhook Download Media = ON
- Webhook on Create = OFF
- Webhook on ACK = OFF
- Webhook On Reaction = OFF
- URL = `https://ia-rionegrowhatsapp.onrender.com/api/webhook`

## Revisar Render Environment

Variables esperadas:

```env
DATABASE_URL=...
DIRECT_URL=...
ADMIN_EMAIL=admin@rionegro.gov
ADMIN_PASSWORD=admin123
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
ULTRAMSG_INSTANCE_ID=instance177604
ULTRAMSG_BASE_URL=https://api.ultramsg.com/instance177604
ULTRAMSG_TOKEN=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
ELEVENLABS_LANGUAGE_CODE=es
WHATSAPP_SAFE_MODE=true
WHATSAPP_AUDIO_REPLIES=true
WHATSAPP_SEND_TEXT_WITH_AUDIO=false
WHATSAPP_LANGUAGE=es
```

## Revisar Render Build Command

Recomendado:

```bash
npm install && npx prisma generate && npx prisma db push && npm run build
```

Tambien se puede usar:

```bash
npm install && npm run build:render
```

Start Command:

```bash
npm start
```

Node recomendado:

```text
20.x
```

## Revisar Render logs

Buscar:

```text
Ready
[auth] login attempt
[dashboard] loading data
[whatsapp] webhook received
[ultramsg] sending text
[ultramsg] sending audio
```

Si aparece `Node.js version 24...`, Render no esta respetando el Node recomendado.
Configura `NODE_VERSION=20` o deja que `package.json` use `engines.node=20.x`.
