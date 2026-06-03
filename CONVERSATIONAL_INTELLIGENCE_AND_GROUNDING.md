# Inteligencia conversacional y grounding

## 1. Que estaba fallando

El bot podia caer desde una pregunta absurda o fuera de alcance al fallback municipal general. Eso hacia que respondiera con dependencias, tramites o informacion institucional aunque el usuario no hubiera preguntado algo relacionado con la Alcaldia de Rionegro.

Tambien habia riesgo de confundir preguntas sobre como reportar algo con reportes reales. Por ejemplo, "Que hago para reportar un hueco?" no debe crear un caso todavia; "Hay un hueco peligroso en tal sector" si debe iniciar el flujo de reporte.

## 2. Clasificacion de intencion

La capa nueva vive en `src/server/intent-classifier.ts`.

La funcion principal es:

```ts
analyzeUserMessageIntent(message, context)
```

Devuelve:

```ts
{
  intent,
  confidence,
  shouldUseKnowledgeBase,
  shouldCreateCitizenReport,
  shouldAskClarifyingQuestion,
  shouldRefuseBecauseUnknown,
  reason,
  officialDataRequested,
  isReportInformationRequest,
}
```

Intenciones soportadas:

- `OUT_OF_SCOPE`
- `ABSURD_OR_UNKNOWN`
- `GENERAL_MUNICIPAL_INFO`
- `KNOWLEDGE_BASE_QUERY`
- `CITIZEN_REPORT`
- `EMERGENCY_REPORT`
- `PAYMENT_OR_TAX`
- `AMBIGUOUS`
- `GREETING`
- `THANKS`

## 3. Decision de uso de base de conocimiento

El bot usa base de conocimiento solo cuando la intencion corresponde a informacion municipal o datos oficiales verificables. La clasificacion corta antes los casos absurdos, fuera de alcance, saludos, agradecimientos, ambiguedad y reportes ciudadanos.

Datos oficiales como direcciones, horarios, telefonos, correos, requisitos, pagos, PQRS, dependencias y enlaces deben venir de la base de conocimiento o de constantes oficiales del proyecto.

## 4. Cuando no sabe

Si la pregunta es absurda, fuera de alcance o pide un dato oficial sin fuente recuperada, la respuesta queda limitada a:

```text
No tengo informacion oficial sobre eso en este momento.
```

Cuando conviene orientar dentro del alcance, se usa:

```text
No tengo informacion oficial sobre eso en este momento. Puedo ayudarte con tramites, servicios o reportes ciudadanos de Rionegro.
```

## 5. Evitar respuestas de relleno

`src/server/whatsapp-reply-style.ts` aplica la limpieza final:

- elimina frases prohibidas como "A continuacion", "Estimado ciudadano" y "Te puedo compartir las siguientes dependencias";
- quita bullets innecesarios si la pregunta es simple;
- recorta respuestas simples a pocos parrafos;
- evita transformar una respuesta de "no se" en un texto institucional largo.

## 6. Evitar dependencias irrelevantes

`validateAnswerGrounding()` bloquea respuestas que agreguen dependencias cuando el usuario no las pidio. Tambien bloquea datos oficiales sin fuente recuperada.

Esto evita que preguntas como "Quien gana una pelea entre Batman y Goku?" terminen en una lista de secretarias.

## 7. Reportes ciudadanos

El webhook queda asi:

```text
WhatsApp
-> normalizar mensaje
-> transcribir audio si aplica
-> extraer caption si imagen
-> analyzeUserMessageIntent()
-> si CITIZEN_REPORT o EMERGENCY_REPORT: handleCitizenReport()
-> si no es reporte: asistente conversacional
```

Reportes reales como "Hay un accidente en Llanogrande" crean caso en el panel con categoria y prioridad.

Preguntas de informacion como "Como pongo una denuncia?" o "Que hago para reportar un hueco?" no crean caso todavia. El bot pide que el ciudadano cuente que paso y en que sector.

Imagen sin texto:

```text
Recibimos la imagen. Cuentanos por favor que ocurrio y en que lugar para poder registrar el reporte correctamente.
```

## 8. Emergencias

Emergencias como disparos, incendio, explosion, fuga de gas, heridos, derrumbe o deslizamiento entran como `EMERGENCY_REPORT` y prioridad `urgent`.

El bot no dice que ya notifico a Policia, Bomberos o Transito. Solo registra el reporte y recomienda contactar la linea correspondiente si hay riesgo inmediato.

## 9. Telefonos de emergencia

Los telefonos se leen desde variables de entorno:

```env
EMERGENCY_PHONE_GENERAL=
EMERGENCY_PHONE_POLICE=
EMERGENCY_PHONE_TRANSIT=
EMERGENCY_PHONE_FIRE_DEPARTMENT=
EMERGENCY_PHONE_HEALTH=
```

La funcion esta en `src/server/emergency-contacts.ts`:

```ts
getEmergencyContacts()
```

Reglas:

- si `EMERGENCY_PHONE_GENERAL` existe, se muestra ese numero;
- si no hay numeros configurados, se dice "linea de emergencias correspondiente";
- no se hardcodean telefonos en el codigo.

## 10. Como probar

Local:

```bash
npm run test:unit
npm run build
```

Por WhatsApp:

1. Enviar: `La Alcaldia vende empanadas interdimensionales?`
   - Debe responder que no tiene informacion oficial.
2. Enviar: `Quien gana una pelea entre Batman y Goku?`
   - No debe listar dependencias.
3. Enviar: `Necesito ayuda con impuestos`
   - Debe preguntar si se refiere a predial, industria y comercio u otro pago.
4. Enviar: `Hay un accidente en Llanogrande`
   - Debe crear reporte ciudadano en el panel.
5. Enviar: `Escuche disparos cerca al parque`
   - Debe crear reporte urgente.
6. Enviar una imagen sin texto.
   - Debe pedir descripcion y ubicacion.
7. Enviar: `Gracias`
   - Debe responder `Con mucho gusto.`

Logs utiles:

- `[assistant] pre-route reply`
- `[citizen-reports] intent detected`
- `[citizen-reports] creating report`
- `[citizen-reports] routed to general assistant`
- `[whatsapp] inbound message`

## Limites

La clasificacion es de reglas deterministicas y conservadoras. Si aparece una nueva familia de preguntas fuera de alcance o una nueva forma de reportar incidentes, se debe agregar a `intent-classifier.ts` o `citizen-report-service.ts` y cubrirla con tests.

La calidad de datos oficiales depende de que la base de conocimiento y las constantes oficiales esten actualizadas.
