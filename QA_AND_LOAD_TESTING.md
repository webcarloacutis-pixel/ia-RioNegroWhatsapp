# QA and Load Testing

## Tests unitarios

```bash
npm run test:unit
```

Tambien queda disponible:

```bash
npm test
```

La suite usa `node:test` con `tsx`; no se migro a Vitest para no cambiar la
arquitectura de pruebas existente.

## Tests de integracion

Los tests de integracion agregados se ejecutan dentro de:

```bash
npm run test:unit
```

Validan endpoints de diagnostico, JSON sin secretos y modo dry-run.

## Simulacion de 1000 usuarios

```bash
npm run simulate:1000
```

La simulacion fuerza:

```env
WHATSAPP_DRY_RUN=true
SIMULATION_MODE=true
WHATSAPP_AUDIO_REPLIES=false
```

No envia mensajes reales a UltraMsg.

Guarda resultados en:

```text
simulation-results/latest.json
```

## Generar reporte QA

```bash
npm run qa:report
```

Actualiza:

```text
APP_STATUS_REPORT.md
```

## Ver resultados en dashboard

Abrir:

```text
/dashboard/estado-sistema
```

Muestra:

- Salud general.
- Estado DB.
- Estado UltraMsg.
- Estado comunicados.
- Estado denuncias.
- Ultima simulacion.
- Tasa de exito.
- Tasa de error.
- Tiempos promedio, p95 y p99.

## Interpretar porcentajes

- `Tasa de exito`: modulos OK / total de modulos.
- `Tasa de error`: modulos en falla / total de modulos.
- `Atencion`: modulo operativo, pero con riesgo o configuracion incompleta.

## Si un comunicado no se envia

Revisar:

1. `/api/debug/announcements`.
2. `/api/debug/ultramsg`.
3. Logs `[announcements] send requested`.
4. Logs `[announcements] recipients loaded`.
5. Logs `[announcements] blocked by safe mode`.
6. Logs `[announcements] no recipients`.
7. Logs `[announcements] failed`.
8. Que el worker `rionegro-panel-scheduler` este activo en Render.
9. Que el segmento tenga telefonos o exista `ULTRAMSG_DEFAULT_TO`.
10. Que `WHATSAPP_DRY_RUN` no este activo si se quiere envio real.

## Si aparecen errores 520

Revisar:

- Logs de Render del web service.
- Reinicios o consumo de memoria.
- Prisma: `/api/debug/db`.
- Tablas faltantes: correr `npx prisma db push`.
- Rutas server-rendered del dashboard.
- Worker y web usando mismas variables.

## Si aparece `ERR_CONNECTION_CLOSED`

Puede ocurrir por:

- Render despertando o redeploying.
- Proceso reiniciado.
- Timeout de DB o proveedor externo.
- Exceso de carga.

Revisar `/api/health` y logs de Render.

## Si aparece React error #418

Posibles causas:

- Hidratacion con HTML server distinto al cliente.
- Componentes de graficas midiendo contenedores colapsados.
- Fechas renderizadas de forma distinta server/cliente.
- Datos que cambian durante la hidratacion.

Mitigacion aplicada:

- Vista QA usa barras CSS simples, sin Recharts.
- Wrappers de Recharts existentes tienen `min-w-[280px]`, `min-h-[320px]` y `overflow-hidden`.

## Si las graficas fallan por tamano

Revisar que el contenedor tenga:

```tsx
className="h-80 min-h-[320px] w-full min-w-[280px] overflow-hidden"
```

Si Recharts sigue fallando, usar barras CSS como en `/dashboard/estado-sistema`.
