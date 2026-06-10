# Eva Conversational RAG Stability

## Objetivo

Eva debe responder con la base de conocimiento de PostgreSQL en Render como fuente principal. No debe depender del JSON ciudadano cuando la base real esta disponible, y no debe decir "no tengo informacion oficial" si ya encontro fichas confiables para la pregunta.

## Flujo Actual

1. El mensaje se clasifica con `classifyIntent`.
2. Eva consulta `retrieveEvaKnowledge`.
3. `retrieveEvaKnowledge` carga fichas activas desde PostgreSQL mediante `getActiveKnowledgeEntries`.
4. La busqueda rankea por pregunta, respuesta, categoria, intent, tags, aliases, idioma, sinonimos y memoria conversacional.
5. La respuesta se construye usando las fichas recuperadas antes de cualquier fallback.
6. Si el formateador final intenta devolver "no tengo informacion oficial" mientras existen fichas, `validateEvaFinalAnswer` regenera la respuesta con esas fichas.

## Resiliencia De Base De Datos

- Las consultas de conocimiento usan `withDatabaseRetry`.
- Reintenta errores de conexion Prisma/PostgreSQL clasificados como `DATABASE_CONNECTION_FAILED`.
- Mantiene una cache en memoria de fichas activas durante 5 minutos.
- Si PostgreSQL falla pero existe cache, Eva responde desde `cache` y registra el evento.
- Si PostgreSQL falla y no hay cache, el error se propaga para no ocultar un problema real de datos.

## Invalidez De Cache

La cache se invalida cuando el administrador:

- Crea una ficha.
- Edita una ficha.
- Elimina una ficha.
- Activa o desactiva una ficha.
- Marca una ficha como revisada.
- Ejecuta acciones masivas.

## Diagnostico Visible

En "Probar con Eva" dentro de la base de conocimiento se muestra:

- Fuente usada: `db` o `cache`.
- Score de coincidencia.
- Estrategia de busqueda.
- Si uso memoria conversacional.
- Query normalizada.
- Fichas usadas y score por ficha.

## Variables Importantes

Para correr desde local contra Render PostgreSQL, `DATABASE_URL` y `DIRECT_URL` deben usar el host externo y `sslmode=require`.

Ejemplo sin secretos:

```env
DATABASE_URL="postgresql://USUARIO:PASSWORD@HOST_EXTERNO_RENDER/NOMBRE_DB?sslmode=require"
DIRECT_URL="postgresql://USUARIO:PASSWORD@HOST_EXTERNO_RENDER/NOMBRE_DB?sslmode=require"
```

Dentro de Render, tambien puede usarse la URL interna si el servicio y la base estan en la misma red privada.

## Pruebas Relacionadas

- `tests/server/eva-knowledge-retrieval.test.ts`
- `tests/server/rionegro-assistant-internals.test.ts`
- `tests/server/conversation-router.test.ts`
- `tests/server/knowledge-dashboard-service.test.ts`
