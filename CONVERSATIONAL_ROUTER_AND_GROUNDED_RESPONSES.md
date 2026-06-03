# Conversational Router And Grounded Responses

## Que estaba fallando

El bot podia responder mas de lo necesario, usar informacion municipal como relleno, mezclar dependencias cuando no se pedian y tratar preguntas absurdas o fuera de alcance como si fueran consultas oficiales.

## Como analiza intencion

Antes de responder, el flujo pasa por `analyzeConversationIntent` y `routeConversationBeforeAssistant`. Esa capa normaliza el mensaje, detecta saludos, agradecimientos, preguntas ambiguas, preguntas fuera de alcance, consultas oficiales y reportes ciudadanos.

La salida incluye intencion, confianza, objetivo del usuario, si necesita base de conocimiento, si debe pedir aclaracion, si debe crear reporte y la forma esperada de respuesta.

## Cuando usa base de conocimiento

Usa base de conocimiento solo cuando el mensaje pide datos oficiales o esta dentro del alcance municipal: ubicaciones, horarios, pagos, tramites, PQRS, dependencias, comunicados, servicios o informacion cargada oficialmente.

`retrieveRelevantKnowledge` trae maximo las entradas relevantes. No descarga toda la base para responder.

## Cuando dice que no sabe

Si la pregunta pide un dato oficial y no hay evidencia suficiente, responde:

```text
No tengo informacion oficial sobre eso en este momento.
```

Si la pregunta esta fuera de alcance o es absurda, responde con la version que redirige a tramites, servicios o reportes ciudadanos de Rionegro.

## Como evita respuestas de relleno

`validateFinalAnswer` revisa si la respuesta:

- contesta la pregunta,
- es demasiado larga,
- usa frases prohibidas,
- mete dependencias no pedidas,
- contiene datos oficiales sin evidencia.

Si falla, el sistema reformula o bloquea la respuesta con una frase corta de desconocimiento oficial.

## Como evita dependencias irrelevantes

Si el usuario no pregunta por dependencias, secretarias u oficinas, la respuesta no puede rellenar con listas de dependencias. Ese caso se detecta como `containsUnrequestedDependencies`.

## Preguntas absurdas

Preguntas como peleas ficticias, empanadas interdimensionales, horoscopo, apuestas o temas generales no municipales se clasifican como `ABSURD_OR_UNKNOWN` u `OUT_OF_SCOPE`.

La respuesta no usa conocimiento municipal como relleno.

## Reportes ciudadanos

Mensajes que describen un hecho real, como accidentes, huecos, arboles caidos, incendios o disparos, activan el flujo de reportes antes del asistente general.

Si falta ubicacion exacta, el bot pide sector y foto. Si hay sector, registra la informacion y pide foto o punto de referencia adicional.

Preguntas como "Como pongo una denuncia?" no crean reporte automaticamente; orientan pidiendo que el ciudadano cuente que paso y en que sector.

## Emergencias

Si el reporte parece urgente, el bot registra la situacion como urgente y recomienda comunicarse con la linea configurada.

Variables disponibles:

```env
EMERGENCY_PHONE_GENERAL=123
EMERGENCY_PHONE_POLICE=
EMERGENCY_PHONE_TRANSIT=
EMERGENCY_PHONE_FIRE_DEPARTMENT=
EMERGENCY_PHONE_HEALTH=
```

Si no hay numero configurado, usa "la linea de emergencias correspondiente" y no inventa telefonos.

## Como se prueba

La suite cubre:

- ubicacion simple sin bullets,
- preguntas absurdas sin dependencias,
- fuera de alcance,
- ambiguedad con una sola pregunta,
- gracias y hola cortos,
- impuestos ambiguos,
- reportes con y sin ubicacion,
- denuncia como orientacion, no reporte automatico,
- frases prohibidas,
- dependencias no solicitadas,
- falta de evidencia oficial.

Comandos:

```bash
npm run test:unit
npm run lint
npm run build
```

## Logs clave

```text
[conversation] intent analyzed
[conversation] out of scope
[conversation] ambiguous question
[conversation] knowledge retrieved
[conversation] insufficient knowledge
[conversation] final answer validated
[conversation] final answer rewritten
[citizen-reports] report flow activated
```
