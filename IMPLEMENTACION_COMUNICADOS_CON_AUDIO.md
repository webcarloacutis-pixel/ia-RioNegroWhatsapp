# Implementacion de Comunicados con Audio

## Que se agrego

El modulo de Comunicados permite adjuntar una nota de voz o archivo de audio existente al crear o editar un comunicado. El admin puede subir el audio, reproducir una vista previa, quitarlo antes de guardar y ver el badge `Con audio` en la bandeja.

Esto no genera audio con IA, no usa ElevenLabs, no usa OpenAI y no clona voces. El audio debe venir grabado desde computador o celular.

## Storage

Los audios se suben a Cloudinary como recurso tipo `video`, que es el tipo que Cloudinary usa para audio/video.

Carpeta:

```text
rionegro/announcements/audio
```

No se guarda base64 en la base de datos. En Prisma solo se guardan URL publica, public id, nombre, MIME, tamano, duracion opcional y proveedor.

Render no debe usarse como almacenamiento final porque su disco puede perder datos en redeploys o reinicios. El fallback local no esta implementado para produccion.

## Variables

```env
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
CLOUDINARY_FOLDER="rionegro/announcements"
```

Para pruebas seguras:

```env
CLOUDINARY_MOCK=true
WHATSAPP_DRY_RUN=true
ULTRAMSG_MOCK=true
```

## Formatos Permitidos

Extensiones:

```text
mp3, m4a, ogg, oga, wav, webm, aac
```

MIME types:

```text
audio/mpeg, audio/mp3, audio/mp4, audio/m4a, audio/ogg, audio/wav, audio/webm, audio/aac
```

Limite:

```text
15 MB
```

La duracion se guarda si Cloudinary la devuelve. Si se requiere una validacion exacta previa de 5 minutos, se puede agregar luego con una libreria como `music-metadata`.

## Flujo de Envio

Sin audio ni imagen: envia texto como antes.

Con imagen sin audio: envia imagen con caption como antes.

Con audio: envia un texto corto y luego el audio.

Con imagen + audio: envia en este orden:

```text
texto corto -> imagen -> audio
```

En dry-run o `ULTRAMSG_MOCK=true`, no se llama UltraMsg real. En `WHATSAPP_SAFE_MODE=true` sin dry-run, los envios proactivos quedan bloqueados.

## UltraMsg Real

El envio real usa:

```text
POST /messages/audio
```

con el campo:

```text
audio=<URL publica de Cloudinary>
```

Si UltraMsg rechaza URLs para audio en la cuenta/instancia, revisar configuracion o soporte de UltraMsg antes de cambiar a otra estrategia. No se debe guardar base64 en DB ni convertir audios en el servidor de Render.

## Como Probar Local

1. Aplicar schema:

```bash
npx prisma db push
```

2. Iniciar con mocks seguros:

```env
CLOUDINARY_MOCK=true
WHATSAPP_DRY_RUN=true
ULTRAMSG_MOCK=true
```

3. Entrar a `Dashboard -> Comunicados`.
4. Crear comunicado.
5. Subir audio MP3/M4A/OGG/WAV/WEBM/AAC.
6. Confirmar que aparece el reproductor.
7. Guardar.
8. Editar el comunicado y confirmar que el audio sigue visible.
9. Simular envio.

## Como Probar En Render

1. Configurar variables de Cloudinary.
2. Ejecutar `npx prisma db push` contra la DB de produccion o usar el comando de build existente que ya hace `prisma db push`.
3. Mantener `WHATSAPP_DRY_RUN=true` para la primera prueba.
4. Subir un audio pequeno.
5. Guardar y simular envio.
6. Revisar logs de Render:

```text
[uploads] announcement audio upload requested
[uploads] announcement audio uploaded
[announcements] dry-run simulated
```

## Como Probar UltraMsg Real

1. Confirmar que el audio de Cloudinary abre desde una URL publica.
2. Configurar:

```env
WHATSAPP_DRY_RUN=false
ULTRAMSG_MOCK=false
WHATSAPP_SAFE_MODE=false
ULTRAMSG_TOKEN="..."
ULTRAMSG_INSTANCE_ID="..."
```

3. Usar un segmento pequeno con destinatario explicito.
4. Enviar comunicado con audio.
5. Verificar que WhatsApp recibe texto corto y audio.
6. Si hay imagen + audio, verificar orden: texto corto, imagen, audio.

## Riesgos Pendientes

- UltraMsg puede variar por cuenta/instancia en soporte de audio por URL.
- La duracion maxima no se valida antes de subir si Cloudinary no devuelve metadata.
- El panel guarda un audio por comunicado; no hay modelo de multiples adjuntos.
- Los delivery logs usan el campo `details` con prefijos `[IMAGE]` y `[AUDIO]`; no se agrego una tabla separada por cada media enviado.
