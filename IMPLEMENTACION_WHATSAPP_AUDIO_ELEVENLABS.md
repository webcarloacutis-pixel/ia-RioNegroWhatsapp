# Implementacion WhatsApp, audio y ElevenLabs

## 1. Que se agrego

Se agrego la integracion inbound de WhatsApp con UltraMsg para:

- Recibir mensajes en `POST /api/webhook`.
- Mantener `POST /api/ultramsg/webhook` como ruta real.
- Procesar texto, imagen/documento con caption y notas de voz.
- Transcribir audio con OpenAI.
- Generar respuesta con el asistente actual de Rionegro.
- Convertir la respuesta a audio con ElevenLabs.
- Enviar audio por UltraMsg usando `POST /messages/audio`.
- Enviar texto por UltraMsg usando `POST /messages/chat`.

El envio de texto sigue la forma oficial de UltraMsg: `axios`, `qs` y
`application/x-www-form-urlencoded`.

## 2. Archivos modificados

- `.env.example`
- `package.json`
- `package-lock.json`
- `src/app/api/ultramsg/webhook/route.ts`
- `src/server/assistant-analytics-service.ts`
- `src/server/messageService.ts`
- `src/server/openai-service.ts`

## 3. Archivos creados

- `src/server/elevenlabs-service.ts`
- `IMPLEMENTACION_WHATSAPP_AUDIO_ELEVENLABS.md`

## 4. Flujo de texto

1. El usuario escribe por WhatsApp.
2. UltraMsg llama `POST /api/webhook`.
3. El alias reexporta hacia `POST /api/ultramsg/webhook`.
4. El webhook parsea `application/json`, `application/x-www-form-urlencoded`
   o texto raw con JSON.
5. Se ignoran grupos, mensajes `fromMe`, eventos no inbound, mensajes vacios y
   duplicados por `data.id`.
6. Se crea `sessionId = whatsapp:+numero`.
7. Se llama al asistente actual con `chatWithAssistant(sessionId, mensaje)`.
8. Se responde con audio si ElevenLabs esta configurado y
   `WHATSAPP_AUDIO_REPLIES` no es `"false"`.
9. Si ElevenLabs no esta disponible o falla, se responde por texto.

## 5. Flujo de nota de voz

1. El usuario envia una nota de voz.
2. UltraMsg envia un payload con tipo `audio`, `ptt` o `voice`.
3. El webhook busca media en estas claves:
   `media`, `mediaUrl`, `media_url`, `downloadUrl`, `download_url`, `url`,
   `file`, `audio`, `body`.
4. Se soporta URL HTTP/HTTPS, data URI base64 y base64 crudo.
5. Se descarga o decodifica el audio.
6. OpenAI transcribe con `OPENAI_TRANSCRIPTION_MODEL` o
   `gpt-4o-mini-transcribe`.
7. La transcripcion pasa al asistente actual.
8. La respuesta se envia como audio con ElevenLabs y UltraMsg.
9. Si no se puede descargar o transcribir, se envia un texto de fallback.

## 6. Envio de audio

ElevenLabs genera un MP3 en base64 con:

```env
ELEVENLABS_MODEL_ID="eleven_multilingual_v2"
ELEVENLABS_OUTPUT_FORMAT="mp3_44100_128"
ELEVENLABS_LANGUAGE_CODE="es"
```

Luego UltraMsg recibe ese base64 en:

```text
POST /messages/audio
Content-Type: application/x-www-form-urlencoded
```

## 7. Variables necesarias

```env
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5-mini"
OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"

ULTRAMSG_INSTANCE_ID="instanceXXXXX"
ULTRAMSG_BASE_URL="https://api.ultramsg.com/instanceXXXXX"
ULTRAMSG_TOKEN=""

ELEVENLABS_API_KEY=""
ELEVENLABS_VOICE_ID=""
ELEVENLABS_MODEL_ID="eleven_multilingual_v2"
ELEVENLABS_OUTPUT_FORMAT="mp3_44100_128"
ELEVENLABS_LANGUAGE_CODE="es"

WHATSAPP_SAFE_MODE="true"
WHATSAPP_AUDIO_REPLIES="true"
WHATSAPP_SEND_TEXT_WITH_AUDIO="false"
WHATSAPP_LANGUAGE="es"
```

`ULTRAMSG_API_URL` se mantiene como compatibilidad legacy, pero la integracion
nueva prioriza `ULTRAMSG_BASE_URL`.

## 8. Configuracion UltraMsg

En el panel de UltraMsg:

- URL: `https://ia-tetr-hakton.onrender.com/api/webhook`
- Webhook on Received = ON
- Webhook Download Media = ON
- Webhook on Create = OFF
- Webhook on ACK = OFF
- Webhook On Reaction = OFF
- Reintentos de webhook = 3
- Enviar retraso = 1
- Retardo maximo de envio = 15

## 9. Probar texto

1. Envia `Hola` desde WhatsApp al numero conectado en UltraMsg.
2. Revisa logs con:

```bash
[whatsapp] webhook received
[whatsapp] inbound message
[assistant] reply generated
[ultramsg] sending audio
[ultramsg] reply sent
```

3. Si `WHATSAPP_AUDIO_REPLIES="false"`, espera respuesta de texto.

## 10. Probar nota de voz

1. Verifica que `Webhook Download Media = ON`.
2. Envia una nota de voz corta.
3. Revisa logs:

```bash
[whatsapp] audio received
[transcription] started
[transcription] result
[assistant] reply generated
```

4. Debe llegar una respuesta de audio si ElevenLabs esta configurado.

## 11. Probar respuesta de audio

Usa:

```env
WHATSAPP_AUDIO_REPLIES="true"
WHATSAPP_SEND_TEXT_WITH_AUDIO="false"
```

Con `WHATSAPP_SAFE_MODE="true"`, el sistema envia solo audio cuando ElevenLabs
funciona. No manda texto adicional junto al audio.

## 12. Desactivar audio

```env
WHATSAPP_AUDIO_REPLIES="false"
```

Con eso el webhook responde solo texto por `POST /messages/chat`.

## 13. Fallback a texto si ElevenLabs falla

Si falta `ELEVENLABS_API_KEY`, falta `ELEVENLABS_VOICE_ID` o la API de
ElevenLabs responde con error, el webhook registra:

```bash
[elevenlabs] error generating audio, falling back to text
```

Luego envia la respuesta por texto.

## 14. Que NO se copio del hackathon

No se migro logica de ecommerce, carrito, catalogo, productos, checkout ni
flujos de pago. El webhook usa el asistente institucional existente:
`chatWithAssistant`.

## 15. Pruebas manuales

Health check:

```bash
curl https://ia-tetr-hakton.onrender.com/api/webhook
```

Webhook local de texto:

```bash
curl -X POST http://localhost:3030/api/webhook \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"message_received\",\"data\":{\"id\":\"test-1\",\"from\":\"573001112233@c.us\",\"type\":\"chat\",\"body\":\"Hola\"}}"
```

Webhook local de audio base64:

```bash
curl -X POST http://localhost:3030/api/webhook \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"message_received\",\"data\":{\"id\":\"voice-1\",\"from\":\"573001112233@c.us\",\"type\":\"audio\",\"mimetype\":\"audio/ogg\",\"body\":\"BASE64_AUDIO_AQUI\"}}"
```

Duplicados:

```bash
# Enviar dos veces el mismo data.id. La segunda respuesta debe incluir:
# {"ignored":true,"reason":"duplicate"}
```

Secretos:

```bash
# Revisar logs y confirmar que no aparecen:
# ULTRAMSG_TOKEN, OPENAI_API_KEY, ELEVENLABS_API_KEY
```
