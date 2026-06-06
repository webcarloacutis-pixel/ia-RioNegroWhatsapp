# Base de conocimiento simple

La pantalla `/dashboard/base-conocimiento` permite agregar informacion para Eva sin manejar campos tecnicos de RAG.

## Crear una ficha

El administrador solo debe completar:

- Pregunta o tema.
- Respuesta que Eva debe dar.
- Categoria.
- Si Eva puede usar esa informacion.

Opcionalmente puede agregar variantes de pregunta, una por linea.

## Campos automaticos

Al guardar, el sistema completa internamente:

- `sourceType`: `manual_admin`.
- `sourceName`: `Panel admin`.
- `confidence`: `0.8`.
- `needsReview`: `false`.
- `isOfficial`: `false`.
- `intent`: segun palabras como ubicacion, horario, contacto, pago o PQRS.
- `tags`: palabras importantes de pregunta, respuesta y categoria.
- `aliases`: variantes utiles para encontrar la ficha.

No se usa OpenAI para generar estos metadatos. Es deterministico y no consume creditos.

## Variantes y busqueda

Eva busca en:

- Pregunta.
- Respuesta.
- Respuesta corta.
- Categoria.
- Intencion.
- Tags.
- Aliases.

La busqueda normaliza mayusculas, tildes, signos y errores simples como `dirrecion`.

Ejemplo: si la ficha dice `Donde queda el restaurante Las Delicias?`, Eva tambien puede encontrarla con:

- `ubicacion restaurante las delicias`
- `direccion restaurante las delicias`
- `como llego a las delicias`

## Eliminar o desactivar

Cada card tiene acciones claras:

- Ver.
- Editar.
- Probar.
- Desactivar o activar.
- Eliminar.

Eliminar pide confirmacion antes de borrar la ficha de la base. Desactivar mantiene la ficha guardada, pero Eva deja de usarla.

## Probar con Eva

Usa el panel `Probar con Eva` o el boton `Probar` de una card.

Si Eva encuentra evidencia suficiente, muestra la respuesta y las fichas usadas. Si no encuentra una ficha relacionada, muestra un aviso para revisar pregunta, variantes o categoria.

## Campos ocultos

Estos campos siguen existiendo en PostgreSQL, pero ya no se muestran en el formulario simple:

- Tags.
- Aliases tecnicos.
- Fuente.
- URL fuente.
- Tipo de fuente.
- Confianza.
- Ultima verificacion.
- Intencion tecnica.
- Revision tecnica.
