# Clasificador de alertas ciudadanas

## Objetivo

El bot debe crear reportes ciudadanos solo cuando el mensaje describe un hecho publico observable que afecta seguridad, movilidad, espacio publico, infraestructura o convivencia. Las consultas informativas, solicitudes de servicios privados y ayudas personales no crean alerta.

## Consulta vs alerta

No es alerta cuando el usuario pide informacion o ayuda personal:

- `Mi gato esta enfermo y necesito veterinaria 24 horas.`
- `Donde hay farmacia abierta?`
- `Mi mama esta enferma, donde hay hospital?`
- `Como reporto un hueco?`

En esos casos el sistema busca base de conocimiento si aplica. Si no hay informacion oficial, responde que no tiene informacion oficial y no inventa negocios, telefonos, direcciones ni horarios.

Si el usuario describe un incidente real, si puede crear alerta:

- `Hay un accidente en Llanogrande.`
- `Se cayo un arbol en la via San Antonio.`
- `Hay un incendio por el aeropuerto.`
- `Se oyen tiros cerca al parque.`
- `Hay un gato atropellado en la via San Antonio.`

## Veterinaria 24 horas

`veterinaria 24 horas` es una busqueda de servicio privado. No crea reporte ciudadano por si sola. Si la base oficial tiene un directorio aprobado, el bot puede listarlo. Si no, responde:

```text
No tengo informacion oficial sobre veterinarias 24 horas en este momento.

Si tu gato esta enfermo, te recomiendo contactar directamente una clinica veterinaria cercana o buscar un servicio veterinario de urgencias.
```

## Mascotas que si generan alerta

Una mascota personal enferma no es alerta. Un animal en via publica, atropellado, muerto, suelto, agresivo o bloqueando movilidad si puede ser alerta.

Ejemplos que crean alerta:

- `Atropellaron un perro en Llanogrande.`
- `Hay un perro herido en la carretera.`
- `Hay ganado en la via.`
- `Hay un caballo suelto en la autopista.`

Ejemplos ambiguos:

- `Hay un perro herido.`
- `Necesito ayuda urgente con mi perro.`

En esos casos se pide confirmacion antes de registrar.

## Confirmacion

Si el mensaje puede ser alerta pero no trae hecho claro, el bot no registra nada automaticamente. Responde con una pregunta corta:

```text
Entiendo. Quieres que registre esto como alerta ciudadana? Si es asi, dime que paso, el sector exacto y envia una foto si puedes.
```

## Categorias

El clasificador asigna categoria y prioridad:

- `Accidente` / `urgent`: accidente, choque, persona herida, moto caida, carro volcado.
- `Incendio` / `urgent`: incendio, humo de vivienda, llamas.
- `Explosion` / `urgent`: explosion, estallido, bomba, atentado.
- `Seguridad` / `urgent`: disparos, tiros, balacera, amenaza armada.
- `Fuga de gas` / `urgent`: fuga de gas, olor a gas.
- `Inundacion` / `urgent`: inundacion, creciente, agua entrando.
- `Derrumbe` / `urgent`: derrumbe, deslizamiento, tierra en la via.
- `Arbol caido` / `high`: arbol, palo o rama bloqueando.
- `Poste o cable caido` / `high`: poste caido, cables en suelo o colgando.
- `Semaforo danado` / `high`: semaforo apagado o danado.
- `Hueco en via` / `normal`: hueco, crater, via danada.
- `Vehiculo bloqueando` / `normal`: carro o moto bloqueando, mal parqueado, en anden.
- `Animal en via` / `high`: animal atropellado, herido, muerto, suelto o bloqueando la via.
- `Basuras` / `normal`: basura, escombros o residuos en via.
- `Ruido` / `low`: ruido o musica alta con contexto publico.

## Ubicacion

Se extraen ubicaciones parciales como:

- `en Llanogrande`
- `por San Antonio`
- `via Ojos de Agua`
- `cerca al parque`
- `frente al hospital`
- `por el aeropuerto`
- `en la autopista`
- `en la vereda`

Si el usuario dio una referencia parcial, el bot no debe pedir sector como si no hubiera ubicacion. Puede pedir foto o punto mas exacto.

## Flujo tecnico

1. WhatsApp recibe texto, imagen o audio.
2. Si es audio, se transcribe.
3. Si es imagen, se lee el caption.
4. `analyzeCitizenAlertIntent` clasifica:
   - `INFORMATION_QUERY`
   - `PRIVATE_SERVICE_QUERY`
   - `HOW_TO_REPORT`
   - `CITIZEN_ALERT`
   - `EMERGENCY_ALERT`
   - `AMBIGUOUS_POSSIBLE_ALERT`
   - `NOT_ALERT`
5. Solo `CITIZEN_ALERT` y `EMERGENCY_ALERT` crean reporte.
6. `PRIVATE_SERVICE_QUERY` e `INFORMATION_QUERY` buscan base de conocimiento.
7. `HOW_TO_REPORT` y `AMBIGUOUS_POSSIBLE_ALERT` piden datos o confirmacion.

## Como probar

Unit tests:

```bash
npm run test:unit
```

QA dashboard:

```bash
npm run qa:report
```

Pruebas por WhatsApp:

1. Enviar `Mi gato se enfermo y necesito llevarlo al veterinario 24 horas.`
2. Confirmar que no aparece reporte en el panel de denuncias.
3. Enviar `Hay un gato atropellado en la via San Antonio.`
4. Confirmar que aparece reporte con categoria `Animal en via`, prioridad `high` y ubicacion `via San Antonio`.
5. Enviar `Necesito ayuda urgente con mi perro.`
6. Confirmar que pide aclaracion y no crea reporte.

## Riesgos pendientes

- La confirmacion conversacional se responde, pero no se implemento una cola persistente `awaiting_alert_confirmation` en base de datos.
- La clasificacion es deterministica y conservadora. Puede requerir ajustes con nuevos modismos ciudadanos reales.
- Si la base oficial agrega directorios privados aprobados, la respuesta depende de la calidad de esos registros.
