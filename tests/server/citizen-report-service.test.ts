import test from "node:test";
import assert from "node:assert/strict";

import {
  detectCitizenReportIntent,
  extractLocationFromReportText,
  handleCitizenReport,
} from "@/server/citizen-report-service";

test("detecta accidente como reporte ciudadano urgente antes del asistente general", () => {
  const intent = detectCitizenReportIntent(
    "Hay un accidente en la via Llanogrande",
  );

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Accidente");
  assert.equal(intent.priority, "urgent");
  assert.equal(intent.needsLocation, false);
  assert.match(intent.location ?? "", /Llanogrande/i);
});

test("detecta accidente en Llanogrande como reporte ciudadano", () => {
  const intent = detectCitizenReportIntent("Hay un accidente en Llanogrande");

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Accidente");
  assert.equal(intent.priority, "urgent");
  assert.equal(intent.needsLocation, false);
  assert.match(intent.location ?? "", /Llanogrande/i);
});

test("no marca preguntas generales de la Alcaldia como reportes", () => {
  const intent = detectCitizenReportIntent("Hola, donde queda la Alcaldia?");

  assert.equal(intent.isReport, false);
});

test("no confunde solicitudes de comunicados con denuncias ciudadanas", () => {
  const intent = detectCitizenReportIntent("Hay un comunicado para enviar");

  assert.equal(intent.isReport, false);
});

test("pide ubicacion cuando el reporte no trae sector claro", () => {
  const intent = detectCitizenReportIntent("Hay un hueco peligroso");

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Hueco en vía");
  assert.equal(intent.priority, "normal");
  assert.equal(intent.needsLocation, true);
});

test("detecta reportes de arbol caido con sector escrito como via", () => {
  const intent = detectCitizenReportIntent("Se cayo un arbol via Ojos de Agua");

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Árbol caído");
  assert.equal(intent.priority, "high");
  assert.equal(intent.needsLocation, false);
  assert.match(intent.location ?? "", /Ojos de Agua/i);
});

test("clasifica situaciones graves como urgentes", () => {
  const incendio = detectCitizenReportIntent(
    "Hay un incendio en una casa en San Antonio",
  );
  const disparos = detectCitizenReportIntent("Escuche disparos cerca al parque");

  assert.equal(incendio.category, "Incendio");
  assert.equal(incendio.priority, "urgent");
  assert.equal(incendio.isUrgentSituation, true);
  assert.equal(disparos.category, "Seguridad");
  assert.equal(disparos.priority, "urgent");
});

test("no crea intencion de reporte para preguntas sobre como reportar", () => {
  const reportarHueco = detectCitizenReportIntent("Que hago para reportar un hueco?");
  const denuncia = detectCitizenReportIntent("Como pongo una denuncia?");
  const transito = detectCitizenReportIntent("Donde queda transito?");

  assert.equal(reportarHueco.isReport, false);
  assert.equal(denuncia.isReport, false);
  assert.equal(transito.isReport, false);
});

test("handleCitizenReport registra emergencia y usa telefono configurado si existe", async () => {
  const previousGeneral = process.env.EMERGENCY_PHONE_GENERAL;
  process.env.EMERGENCY_PHONE_GENERAL = "123";

  try {
    const result = await handleCitizenReport({
      text: "Escuche disparos cerca al parque",
      messageType: "chat",
      recipient: "+573001112233",
      whatsappMessageId: `unit-emergency-${Date.now()}`,
    });

    assert.equal(result.handled, true);

    if (result.handled) {
      assert.match(result.reply, /123/);
      assert.equal(result.report?.category, "Seguridad");
      assert.equal(result.report?.priority, "urgent");
    }
  } finally {
    if (previousGeneral === undefined) {
      delete process.env.EMERGENCY_PHONE_GENERAL;
    } else {
      process.env.EMERGENCY_PHONE_GENERAL = previousGeneral;
    }
  }
});

test("handleCitizenReport pide ubicacion y foto cuando accidente solo dice Rionegro", async () => {
  const result = await handleCitizenReport({
    text: "Hay un accidente en Rionegro",
    messageType: "chat",
    recipient: "+573001112245",
    whatsappMessageId: `unit-accident-location-${Date.now()}`,
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.equal(result.needsMoreInfo, true);
    assert.match(result.reply, /ubicaci[oó]n exacta|sector/i);
    assert.match(result.reply, /foto/i);
  }
});

test("handleCitizenReport registra accidente con sector y pide foto o referencia", async () => {
  const result = await handleCitizenReport({
    text: "Hay un accidente en Llanogrande",
    messageType: "chat",
    recipient: "+573001112246",
    whatsappMessageId: `unit-accident-llanogrande-${Date.now()}`,
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.equal(result.report?.category, "Accidente");
    assert.equal(result.report?.location, "Llanogrande");
    assert.match(result.reply, /accidente/i);
    assert.match(result.reply, /Llanogrande/i);
    assert.match(result.reply, /foto|referencia/i);
  }
});

test("handleCitizenReport conserva via San Antonio como ubicacion parcial", async () => {
  const result = await handleCitizenReport({
    text: "Hay un arbol caido en la via San Antonio",
    messageType: "chat",
    recipient: "+573001112247",
    whatsappMessageId: `unit-tree-san-antonio-${Date.now()}`,
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.match(result.report?.category ?? "", /rbol ca/i);
    assert.match(result.report?.location ?? "", /via San Antonio/i);
    assert.match(result.reply, /arbol caido/i);
    assert.match(result.reply, /San Antonio/i);
    assert.match(result.reply, /foto|referencia/i);
    assert.doesNotMatch(result.reply, /dime por favor.*sector/i);
  }
});

test("extractLocationFromReportText detecta ubicaciones parciales conocidas", () => {
  assert.equal(extractLocationFromReportText("Hay un accidente en Llanogrande"), "Llanogrande");
  assert.equal(
    extractLocationFromReportText("Hay un arbol caido en la via San Antonio"),
    "via San Antonio",
  );
});

test("handleCitizenReport no guarda imagenes con URL privada o MIME no permitido", async () => {
  const result = await handleCitizenReport({
    text: "Hay un hueco peligroso en Llanogrande",
    messageType: "image",
    recipient: "+573001112244",
    whatsappMessageId: `unit-private-image-${Date.now()}`,
    images: [
      {
        url: "http://127.0.0.1/private.jpg",
        filename: "private.jpg",
        mimeType: "image/jpeg",
      },
      {
        url: "https://cdn.example.com/report.svg",
        filename: "report.svg",
        mimeType: "image/svg+xml",
      },
    ],
    hasImage: true,
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.equal(result.report?.images.length, 0);
  }
});
