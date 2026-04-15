# WhatsApp Rionegro - Canal Oficial Inteligente del Municipio

Panel administrativo completo para demo institucional de la Alcaldia de Rionegro.

Incluye:

- Dashboard ejecutivo
- CRUD de comunicados
- Programador de envios
- Base de conocimiento
- Segmentacion por zonas
- Metricas con datos demo
- Asistente IA institucional para pruebas conversacionales
- Login admin simple
- integracion con UltraMsg para envio real configurable
- Integracion opcional con OpenAI para interpretacion hibrida del chatbot

## Stack

- Frontend: Next.js 16 + App Router
- Backend: Next.js Route Handlers + worker Node para scheduler
- ORM: Prisma
- Base de datos: PostgreSQL compatible con Supabase
- UI: Tailwind CSS 4 + Recharts + Sonner

## Credenciales demo

- Email: `admin@rionegro.gov`
- Password: `admin123`

Tambien puedes cambiar estas credenciales desde `.env`.

## Modulos implementados

### Dashboard

- Usuarios simulados
- Mensajes gestionados
- Comunicados activos
- Graficas de actividad y tipologia
- Feed de actividad reciente

### Comunicados

- Crear comunicado
- Editar comunicado
- Eliminar comunicado
- Asociar segmento
- Simular envio
- Enviar ahora

### Programador de envios

- Lista de comunicados programados
- Procesar pendientes
- Logs recientes
- Simulacion y envio manual

### Base de conocimiento

- CRUD de preguntas, respuestas y categorias

### Asistente IA

- Simulador conversacional dentro del panel
- Respuestas formales con informacion oficial de Rionegro
- Preguntas ejemplo sobre municipio, alcalde, secretarias, programas, noticias, eventos y alertas
- Motor hibrido: primero consulta contenido oficial y luego usa OpenAI para interpretar o redactar mejor cuando hace falta
- Memoria basica de contexto para seguimientos como `y manana?`
- Registro de metricas del chatbot: preguntas frecuentes, temas mas consultados y uso diario
- Sin Telegram, Zoom, calendarios ni integraciones externas

### Segmentacion

- CRUD de segmentos
- Usuarios estimados por zona
- Asociacion posterior con comunicados

### Metricas

- Total de ejecuciones
- Alcance estimado
- Tipos mas usados
- Rendimiento por segmento

## Integracion con UltraMsg

La pieza conectada al envio real es:

- [src/server/messageService.ts](src/server/messageService.ts)

La funcion ya existe con esta firma:

```ts
sendMessage({ message, segment, scheduledAt, mode });
```

Comportamiento actual:

- Si `mode === "DEMO"` hace simulacion local
- Si `mode === "MANUAL"` o `mode === "SCHEDULED"` usa UltraMsg cuando las variables estan configuradas
- Si falta configuracion, hace fallback a modo mock

Importante:

- Hoy el panel no tiene una tabla real de contactos por segmento
- Por eso el envio real sale a un numero fijo configurado en `ULTRAMSG_DEFAULT_TO`
- Para envio masivo real por segmento, el siguiente paso es crear el modulo de destinatarios
- Para respuestas automaticas de WhatsApp ya existe el webhook publico en `src/app/api/ultramsg/webhook/route.ts`
- `ULTRAMSG_DEFAULT_TO` puede llevar varios numeros separados por coma, por ejemplo:
  `+573108853250,+573162215323,+573234725938`

En otras palabras:

- Si, hoy puede enviar mensajes reales por UltraMsg
- No, todavia no hace envio masivo real por segmentos con una lista de numeros distinta para cada audiencia
- Hoy los envios manuales y programados salen al numero configurado en `ULTRAMSG_DEFAULT_TO`, salvo las respuestas automaticas del webhook que si responden al remitente real

Configuracion recomendada en UltraMsg:

- URL del webhook: `https://tu-dominio.com/api/ultramsg/webhook`
- Tambien queda disponible la ruta corta compatible:
  `https://tu-dominio.com/api/webhook`
- Si estas en local, expone tu app con `ngrok` o `cloudflared` y usa esa URL publica
- Activa solo `Webhook on Received`
- Deja apagados `Webhook on Create`, `Webhook on ACK`, `Webhook Download Media` y `Webhook On Reaction`
- Reintentos: `3`

## Estructura principal

```text
src/
  app/
    dashboard/
    api/
    login/
  components/
    layout/
    dashboard/
    modules/
    ui/
  lib/
  server/
prisma/
docker-compose.yml
```

## Variables de entorno

Usa `.env.example` como base.

### Opcion 1: PostgreSQL local

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rionegro_panel?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/rionegro_panel?schema=public"
ADMIN_EMAIL="admin@rionegro.gov"
ADMIN_PASSWORD="admin123"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5-mini"
ULTRAMSG_API_URL="https://api.ultramsg.com/instanceXXXXX"
ULTRAMSG_TOKEN="tu-token-ultramsg"
ULTRAMSG_DEFAULT_TO="+573001112233"
```

### Opcion 2: Supabase

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
ADMIN_EMAIL="admin@rionegro.gov"
ADMIN_PASSWORD="admin123"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5-mini"
ULTRAMSG_API_URL="https://api.ultramsg.com/instanceXXXXX"
ULTRAMSG_TOKEN="tu-token-ultramsg"
ULTRAMSG_DEFAULT_TO="+573001112233"
```

## Deploy en Render

El repo ya incluye [render.yaml](render.yaml) para desplegar:

- `rionegro-panel-web`: panel web y API de Next.js
- `rionegro-panel-scheduler`: worker que procesa comunicados programados
- `rionegro-panel-db`: base PostgreSQL administrada por Render

Variables sensibles que debes completar en Render:

- `ADMIN_PASSWORD`
- `OPENAI_API_KEY` si quieres modo hibrido
- `ULTRAMSG_API_URL`
- `ULTRAMSG_TOKEN`
- `ULTRAMSG_DEFAULT_TO`

Comandos usados por Render:

- Build web: `npm install && npx prisma generate && npm run build`
- Predeploy web: `npx prisma db push`
- Start web: `npm run render:start`
- Start worker: `npm run render:worker`

Despues del deploy:

1. Entra al servicio web y copia su URL publica, por ejemplo `https://rionegro-panel-web.onrender.com`
2. Configura en UltraMsg el webhook como:
   `https://TU-SERVICIO.onrender.com/api/ultramsg/webhook`
   o si prefieres la ruta corta:
   `https://TU-SERVICIO.onrender.com/api/webhook`
3. Activa solo `Webhook on Received`
4. Verifica login, comunicados, base de conocimiento y asistente

### OpenAI

El asistente funciona sin OpenAI en modo local, pero si defines `OPENAI_API_KEY` activa el modo hibrido:

- Busca primero en la informacion oficial de Rionegro
- Usa OpenAI para interpretar preguntas ambiguas o redactar respuestas complejas sin salirse del contexto oficial
- Nunca responde como IA generalista ni inventa datos

## Scripts disponibles

### App

- `npm run dev`: frontend + scheduler en paralelo
- `npm run dev:frontend`: Next.js
- `npm run dev:backend`: worker del scheduler
- `npm run build`: build de produccion
- `npm run start:frontend`: levanta Next.js en produccion
- `npm run start:backend`: levanta el scheduler en produccion
- `npm run lint`: lint del proyecto

### Base de datos

- `npm run db:start`: levanta PostgreSQL local con Docker
- `npm run db:stop`: baja el contenedor local
- `npm run db:generate`: genera Prisma Client
- `npm run db:push`: aplica el esquema a la base
- `npm run db:seed`: carga datos demo
- `npm run db:setup`: genera cliente + aplica esquema + seed
- `npm run db:studio`: abre Prisma Studio

## Como correr el proyecto

### Ruta A: con PostgreSQL local

1. Asegura que Docker Desktop este encendido.
2. Copia `.env.example` a `.env` si aun no existe.
3. Ejecuta:

```bash
npm install
npm run db:start
npm run db:setup
npm run dev
```

4. Abre `http://localhost:3030`

### Ruta B: con Supabase

1. Crea tu proyecto en Supabase.
2. Copia las cadenas de conexion a `.env`.
3. Ejecuta:

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Como probar la IA

1. Configura `OPENAI_API_KEY` en `.env`
2. Inicia el proyecto con `npm run dev`
3. Entra a `http://localhost:3030/login`
4. Abre `Asistente IA` en el menu lateral o ve a `http://localhost:3030/dashboard/asistente`
5. Prueba preguntas como:

- `Que hay hoy en Rionegro?`
- `Que esta pasando en Rionegro?`
- `Quien es el alcalde de Rionegro?`
- `Hay alertas recientes?`
- `Donde puedo poner una queja o solicitud?`

La interfaz muestra:

- chat de prueba
- zona y tipo de usuario para test de segmentacion
- tema detectado
- ruta usada para responder
- si se uso OpenAI o respuesta local
- fuentes oficiales utilizadas

## Datos demo incluidos

El seed crea:

- Comunicados oficiales base de tipo `evento`, `noticia` y `alerta`
- Contenido institucional de Rionegro para base de conocimiento
- Segmentos alineados con cobertura municipal y frentes de atencion
- Logs demo para simulacion de envios

## Referencia del bot conversacional

Se tomo como referencia la carpeta local `bot tolentinosw`, pero solo para reutilizar la idea conversacional.

No se incorporaron modulos ajenos al panel institucional como:

- Telegram
- Zoom
- Calendarios
- Automatizaciones externas no relacionadas con la demo

La capa conversacional quedo adaptada al contexto de la Alcaldia de Rionegro y se puede probar desde `Asistente IA` en el panel.

## Verificacion realizada

Se verifico localmente:

- `npm run db:generate`
- `npm run lint`
- `npm run build`

Nota:

- `npm run db:start` requiere Docker Desktop activo. En esta maquina el daemon de Docker no estaba encendido, por eso no pude dejar la base local levantada desde aqui.

## Estado actual del proyecto

Listo para demo y listo para integracion futura.

Integra UltraMsg para envio saliente configurable y mantiene el resto del flujo institucional dentro del panel.
