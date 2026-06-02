# Implementacion denuncias y reportes ciudadanos

## Que cambio

Se reforzo el flujo de WhatsApp para que las denuncias, reportes, alertas,
emergencias y casos ciudadanos entren primero en `MODO REPORTE CIUDADANO`.

Regla principal:

```text
Primero detectar denuncia/reporte/alerta.
Solo si NO es reporte, pasar al asistente general de la Alcaldia.
```

Esto evita que mensajes como `Hay un accidente en la via Llanogrande` o
`DENUNCIA: carro mal parqueado bloqueando la entrada` reciban respuestas de
tramites, direcciones o informacion general.

## Archivos principales

- `src/server/citizen-report-service.ts`
- `src/app/api/ultramsg/webhook/route.ts`
- `src/components/modules/citizen-reports-manager.tsx`
- `src/app/dashboard/denuncias/page.tsx`
- `src/app/api/admin/citizen-reports/route.ts`
- `src/app/api/admin/citizen-reports/[id]/route.ts`
- `src/app/api/admin/citizen-reports/[id]/convert-to-mass-message/route.ts`
- `prisma/schema.prisma`

## Deteccion de reportes

El servicio expone:

```ts
detectCitizenReportIntent(text, messageType)
classifyCitizenReport(text)
handleCitizenReport(input)
```

Detecta palabras y frases naturales como:

```text
denuncia, reporte, alerta, accidente, choque, trancon, taco, via cerrada,
carro mal parqueado, moto en el anden, semaforo, hueco, arbol caido,
inundacion, poste caido, cable caido, basura, ruido, incendio, explosion,
atentado, balacera, disparos, fuga de gas, derrumbe, deslizamiento,
manifestacion, bloqueo vial, animal en la via, aceite en la via
```

Tambien detecta frases sin la palabra "denuncia":

```text
Hay un accidente en...
Se cayo un arbol en...
La via esta cerrada...
El semaforo no sirve...
Hay un hueco peligroso...
Escuche disparos cerca al parque...
```

## Clasificacion

La funcion `classifyCitizenReport(text)` devuelve:

```ts
{
  isReport: boolean;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  location?: string;
  needsLocation: boolean;
  needsImage: boolean;
}
```

Reglas principales:

- `accidente`, `choque`, `heridos`, `ambulancia`: `Accidente` / `urgent`
- `trancon`, `taco`, `via cerrada`, `cierre vial`: `Transito` / `high`
- `mal parqueado`, `anden`: `Vehiculo mal parqueado` / `normal`
- `semaforo`: `Semaforo danado` / `high`
- `hueco`: `Hueco en via` / `normal`
- `arbol caido`: `Arbol caido` / `high`
- `inundacion`: `Inundacion` / `urgent`
- `poste caido`, `cable caido`: `Servicios publicos` / `high`
- `incendio`, `explosion`, `fuga de gas`: `urgent`
- `atentado`, `balacera`, `disparos`: `Seguridad` / `urgent`

## Orden del webhook

El webhook queda asi:

```text
1. Recibe payload UltraMsg.
2. Extrae texto, caption, audio o imagen.
3. Si es audio, transcribe primero.
4. Detecta si es reporte ciudadano.
5. Si es reporte, guarda y confirma.
6. Si NO es reporte, llama al asistente general.
```

Para imagen:

- Imagen con caption de reporte: crea reporte y asocia imagen si UltraMsg entrega URL.
- Imagen sin texto: pide descripcion y ubicacion.
- No se guarda base64 grande en Prisma.

## Respuestas al ciudadano

Si falta ubicacion:

```text
Gracias por reportarlo. Para registrarlo correctamente, dime por favor en que sector o direccion ocurrio. Si puedes, envia tambien una foto del lugar.
```

Si tiene descripcion y ubicacion:

```text
Gracias por reportarlo. Ya registramos la informacion para revision.

Si puedes, envianos una foto del lugar para ayudar a identificar mejor el caso.
```

Si tiene imagen:

```text
Gracias por reportarlo. Ya recibimos la informacion y la imagen del suceso. El caso queda registrado para revision del equipo administrativo.
```

Si es una situacion urgente:

```text
Gracias por avisar. Registramos el reporte como posible situacion urgente para revision.

Si hay personas heridas o riesgo inmediato, por favor comunicate tambien con la linea de emergencias correspondiente.
```

Nunca se afirma que ya se envio patrulla, ambulancia, transito o bomberos.

## Panel admin

La ruta del panel es:

```text
/dashboard/denuncias
```

Muestra:

- Contador de pendientes.
- Contador de urgentes.
- Descripcion.
- Ubicacion detectada.
- Categoria.
- Prioridad.
- Estado.
- Fecha.
- Telefono del reportante solo para admin.
- Imagen o enlace si existe.
- Acciones de estado.
- Conversion a alerta masiva como borrador.

Los reportes `urgent` quedan destacados visualmente.

## Conversion a alerta masiva

El boton `Convertir en alerta masiva` crea un borrador editable en el modulo de
comunicados.

Importante:

- No se envia automaticamente.
- No incluye telefono ni datos privados del ciudadano.
- El admin debe revisar y editar antes de enviar.
- El reporte pasa a `converted_to_mass_message`.

## Imagenes

UltraMsg puede enviar imagen en:

```text
media, mediaUrl, media_url, downloadUrl, download_url, url, file, image, body
```

Se guarda URL y metadata cuando la imagen llega por HTTP/HTTPS y cumple tipo
permitido: `jpg`, `jpeg`, `png` o `webp`.

Limitacion actual: si UltraMsg entrega base64 o una URL temporal, falta conectar
storage persistente como Cloudinary, S3, Supabase Storage u otro.

## Logs esperados

```text
[citizen-reports] intent detected
[citizen-reports] category classified
[citizen-reports] missing location
[citizen-reports] image received
[citizen-reports] creating report
[citizen-reports] report created
[citizen-reports] duplicate skipped
[citizen-reports] confirmation sent
[citizen-reports] routed to general assistant
```

## Pruebas desde WhatsApp

Mensaje general:

```text
Hola, donde queda la Alcaldia?
```

Resultado esperado: responde el asistente general. No crea reporte.

Denuncia:

```text
DENUNCIA: carro mal parqueado bloqueando la entrada del hospital
```

Resultado esperado: crea reporte y no responde con direccion de la Alcaldia.

Accidente:

```text
Hay un accidente en la via Llanogrande
```

Resultado esperado: crea reporte `Accidente` con prioridad `urgent`.

Arbol caido:

```text
Se cayo un arbol via Ojos de Agua
```

Resultado esperado: crea reporte `Arbol caido` con prioridad `high`.

Hueco sin ubicacion:

```text
Hay un hueco peligroso
```

Resultado esperado: crea reporte y pide ubicacion.

Taco:

```text
Hay un taco en la via hacia el aeropuerto
```

Resultado esperado: crea reporte `Transito` con prioridad `high`.

Incendio:

```text
Hay un incendio en una casa en San Antonio
```

Resultado esperado: crea reporte `Incendio` con prioridad `urgent`.

Disparos:

```text
Escuche disparos cerca al parque
```

Resultado esperado: crea reporte `Seguridad` con prioridad `urgent`.

Imagen con caption:

```text
Alerta: semaforo danado cerca al parque principal
```

Resultado esperado: crea reporte con imagen si UltraMsg entrega URL util.

Imagen sin caption:

```text
Sin texto
```

Resultado esperado: pide descripcion y ubicacion; no pasa al asistente general.

## Probar con curl

```bash
curl -X POST "https://ia-rionegrowhatsapp.onrender.com/api/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"message_received","instanceId":"instance177604","data":{"id":"report-test-accidente-001","from":"573001330213@c.us","body":"Hay un accidente en la via Llanogrande","type":"chat","fromMe":false}}'
```

Luego abrir:

```text
https://ia-rionegrowhatsapp.onrender.com/dashboard/denuncias
```

## Prisma

Si falta aplicar el modelo en Render o local:

```bash
npx prisma generate
npx prisma db push
```

Build recomendado en Render:

```bash
npm install && npx prisma generate && npx prisma db push && npm run build
```
