# Dashboard de base de conocimiento de Eva

## Ruta

La interfaz vive en:

```text
/dashboard/base-conocimiento
```

Se reutilizo la seccion existente del dashboard para no duplicar navegacion ni romper el flujo actual de Eva.

## Modelo usado

Se amplio `KnowledgeBaseEntry` en Prisma. Los campos historicos siguen igual:

```text
question
answer
category
```

Y se agregaron metadatos administrativos:

```text
intent
shortAnswer
tags
aliases
sourceUrl
sourceName
sourceType
isOfficial
isActive
needsReview
confidence
lastVerifiedAt
```

Tambien se agrego `KnowledgeConflict` para listar conflictos detectados o cargados en el futuro.

## Badges

`Activo`: Eva puede usar la ficha.

`Inactivo`: la ficha queda visible para administracion, pero no se entrega a Eva en la lectura normal.

`Requiere revision`: el dato debe ser revisado por un admin antes de considerarlo confiable.

`Oficial`: el dato esta marcado como fuente oficial o verificada.

`Baja confianza`: `confidence` es menor a `0.7`.

## Filtros

La pantalla permite filtrar por:

```text
texto
categoria
intencion
fuente
estado activo/inactivo
requiere revision
baja confianza
tags
```

La API pagina resultados para evitar devolver miles de registros de una sola vez.

## Edicion

El boton `Editar` abre un formulario seguro para modificar:

```text
titulo
contenido
respuesta corta
categoria
intencion
tags
aliases
fuente
URL fuente
tipo de fuente
oficial
activo
requiere revision
confianza
ultima verificacion
```

Si el dato proviene de una fuente oficial o scraping oficial, el panel muestra una advertencia antes de guardar cambios.

## Acciones Masivas

La seleccion de cards permite:

```text
activar
desactivar
marcar revisadas
cambiar categoria
exportar JSON
exportar CSV
```

No se agrego eliminacion masiva para evitar acciones destructivas accidentales.

## Conflictos

La seccion `Conflictos` lee registros de `KnowledgeConflict`.

Si no hay conflictos abiertos o cargados, muestra estado vacio. El modelo queda listo para que un crawler o proceso administrativo agregue conflictos entre fuentes.

## Probar Con Eva

La prueba usa:

```text
POST /api/knowledge/test-answer
```

Este flujo:

```text
no envia WhatsApp
no llama ElevenLabs
no crea alertas
no modifica datos
```

Solo busca fichas activas en la base y devuelve una respuesta simulada con confianza y fuentes usadas. Si no encuentra evidencia suficiente, responde:

```text
No tengo informacion oficial sobre eso en este momento.
```

## Endpoints

```text
GET /api/knowledge
GET /api/knowledge/[id]
POST /api/knowledge
PATCH /api/knowledge/[id]
DELETE /api/knowledge/[id]
POST /api/knowledge/[id]/toggle-active
POST /api/knowledge/[id]/mark-reviewed
POST /api/knowledge/bulk
POST /api/knowledge/test-answer
```

Todos requieren sesion admin.

## Comandos

Despues del cambio de Prisma:

```bash
npx prisma generate
npx prisma db push
```

Validaciones recomendadas:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```

## Riesgos Pendientes

El modelo de conflictos esta listo, pero la deteccion automatica de conflictos todavia depende de un crawler o proceso de revision.

La prueba con Eva es una simulacion segura basada en la base de conocimiento; no reemplaza el QA conversacional completo.

El scraping oficial controlado queda como fase futura para no mezclar esta entrega con cambios de crawler y RAG de mayor alcance.
