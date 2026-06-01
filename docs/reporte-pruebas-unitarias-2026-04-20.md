# Reporte de Pruebas Unitarias

Fecha: `2026-04-20`  
Proyecto: `rionegro-panel-alcaldia`

## Resumen ejecutivo

Se ejecutó una batería nueva de pruebas unitarias sobre módulos críticos del panel y del asistente conversacional.  
El resultado general fue satisfactorio:

- Pruebas unitarias: `29/29` aprobadas
- QA del asistente: `8/8` aprobadas
- Lint: `aprobado`
- Build de producción: `aprobado`

Conclusión:

- La lógica base del asistente, las validaciones, los serializadores, el manejo de sesión y las utilidades principales están funcionando correctamente en los escenarios cubiertos.
- No se detectaron fallos funcionales nuevos en los módulos probados.

## Comandos ejecutados

```bash
npm run test:unit
npm run qa:assistant
npm run lint
npm run build
```

## Resultado detallado

### 1. Pruebas unitarias

Comando:

```bash
npm run test:unit
```

Resultado:

- Estado: `OK`
- Total: `29`
- Aprobadas: `29`
- Fallidas: `0`
- Canceladas: `0`
- Omitidas: `0`

### 2. QA del asistente

Comando:

```bash
npm run qa:assistant
```

Resultado:

- Estado: `OK`
- Casos aprobados: `8/8`

### 3. Lint

Comando:

```bash
npm run lint
```

Resultado:

- Estado: `OK`
- Errores de lint: `0`

### 4. Build de producción

Comando:

```bash
npm run build
```

Resultado:

- Estado: `OK`
- Compilación y tipado: `correctos`

## Cobertura funcional alcanzada

### Utilidades y constantes

Archivo:

- [tests/lib/constants.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/lib/constants.test.ts)

Se validó:

- normalización de tipos de comunicado
- formateo de etiquetas conocidas y personalizadas
- consistencia de etiquetas del asistente

### Formateo

Archivo:

- [tests/lib/format.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/lib/format.test.ts)

Se validó:

- fechas vacías
- fechas reales
- números compactos
- labels de estado, delivery y tipo
- transformación para `datetime-local`

### Validaciones

Archivo:

- [tests/lib/validations.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/lib/validations.test.ts)

Se validó:

- esquema de login
- esquema de comunicados
- esquema de segmentos
- limpieza, normalización y deduplicación de números
- esquema de base de conocimiento

### Sesión del asistente

Archivo:

- [tests/server/assistant-session.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/assistant-session.test.ts)

Se validó:

- creación de sesión por defecto
- persistencia de perfil y contexto
- recorte del historial a los últimos 20 mensajes

### Servicio de mensajes

Archivo:

- [tests/server/message-service.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/message-service.test.ts)

Se validó:

- normalización de números
- resolución de destinatarios
- deduplicación de números
- envío demo sin dependencia de UltraMsg

### Serializadores

Archivo:

- [tests/server/serializers.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/serializers.test.ts)

Se validó:

- serialización de comunicados
- serialización de segmentos
- serialización de artículos de conocimiento
- serialización de logs de entrega

### Analítica del asistente

Archivo:

- [tests/server/assistant-analytics-service.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/assistant-analytics-service.test.ts)

Se validó:

- resumen de métricas del asistente
- agrupación de conversaciones por sesión
- detección de sesiones de WhatsApp y panel
- reconocimiento de errores de disponibilidad de base de datos

### Internals del asistente conversacional

Archivo:

- [tests/server/rionegro-assistant-internals.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/rionegro-assistant-internals.test.ts)

Se validó:

- detección de idioma
- detección de intención
- detección de marco temporal
- parser de múltiples intenciones
- detección de citas, turismo, automotriz, horarios, ubicaciones y capacidades

## QA conversacional cubierta

Archivo:

- [qa/assistant.qa.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/qa/assistant.qa.ts)

Casos verificados:

- historia de Rionegro en español
- multi-intent en español
- multi-intent en inglés
- ubicación + horario de movilidad
- lugares de interés
- orientación sobre citas
- planes en Rionegro
- continuidad por contexto con referencia a `Complex`

## Hallazgos durante la ejecución

### Hallazgo 1

La QA del asistente dependía de que siempre existieran noticias cargadas en la base.

Impacto:

- generaba falsos negativos en ambientes donde no había noticias registradas

Acción tomada:

- se ajustó la QA para aceptar tanto el caso con noticias como el fallback válido cuando no existen noticias oficiales cargadas

### Hallazgo 2

No se encontraron errores nuevos en los módulos unitarios cubiertos.

Impacto:

- la base lógica del proyecto quedó estable en esta ronda

## Riesgos o cobertura pendiente

Estas áreas todavía no están cubiertas completamente por pruebas unitarias puras:

- handlers completos de rutas API
- integración real con UltraMsg
- integración real con Prisma y base remota
- scheduler end-to-end
- comportamiento visual completo de componentes React

Esto significa:

- la lógica interna crítica sí quedó bien protegida
- aún conviene mantener pruebas manuales o de integración para flujos completos

## Archivos agregados o ajustados para pruebas

- [package.json](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/package.json)
- [tests/run-unit-tests.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/run-unit-tests.ts)
- [tests/lib/constants.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/lib/constants.test.ts)
- [tests/lib/format.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/lib/format.test.ts)
- [tests/lib/validations.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/lib/validations.test.ts)
- [tests/server/assistant-session.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/assistant-session.test.ts)
- [tests/server/message-service.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/message-service.test.ts)
- [tests/server/serializers.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/serializers.test.ts)
- [tests/server/assistant-analytics-service.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/assistant-analytics-service.test.ts)
- [tests/server/rionegro-assistant-internals.test.ts](/c:/Users/sebas/OneDrive/Escritorio/rionegro-panel-alcaldia/tests/server/rionegro-assistant-internals.test.ts)

## Conclusión final

El proyecto quedó con una base de pruebas más sólida para producción y mantenimiento.  
La lógica crítica del panel y del bot fue validada con éxito en esta ronda.

Estado final de la revisión:

- Unitarias: `aprobadas`
- QA conversacional: `aprobada`
- Lint: `aprobado`
- Build: `aprobado`
