import test from "node:test";
import assert from "node:assert/strict";

import {
  detectCitizenReportIntent,
  handleCitizenReport,
} from "@/server/citizen-report-service";
import {
  buildPendingCitizenReport,
  detectAddressOrLocationFollowup,
  detectShortFollowUp,
  handlePendingCitizenReportFollowup,
} from "@/server/citizen-report-followup-service";

test("reporte de incendio crea pendingCitizenReport y pide datos para completarlo", async () => {
  const text = "quiero hacer un reporte de un incendio en el porvenir";
  const intent = detectCitizenReportIntent(text);
  const result = await handleCitizenReport({
    text,
    messageType: "chat",
    recipient: "+573001118001",
    whatsappMessageId: `unit-fire-pending-${Date.now()}`,
    reportIntent: intent,
    language: "es",
  });

  assert.equal(intent.isReport, true);
  assert.equal(intent.category, "Incendio");
  assert.equal(result.handled, true);

  if (result.handled) {
    const pending = buildPendingCitizenReport({
      report: result.report,
      intent,
      description: text,
      language: "es",
    });

    assert.equal(pending.status, "collecting_location");
    assert.equal(pending.needsLocation, true);
    assert.match(pending.sector ?? "", /Porvenir/i);
    assert.match(result.reply, /ubicaci[oÃ³]n exacta|referencia m[aÃ¡]s exacta|foto/i);
    assert.doesNotMatch(result.reply, /No tengo informaci[oÃ³]n oficial/i);
  }
});

test("direccion despues de reporte pendiente actualiza memoria y no va a RAG", async () => {
  const pending = buildPendingCitizenReport({
    intent: detectCitizenReportIntent("quiero hacer un reporte de un incendio en el porvenir"),
    description: "quiero hacer un reporte de un incendio en el porvenir",
    language: "es",
    now: new Date("2026-06-01T12:00:00.000Z"),
  });
  const result = await handlePendingCitizenReportFollowup({
    pendingCitizenReport: pending,
    text: 'cra66Â·"4-23',
    language: "es",
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.equal(result.normalizedAddress, "Cra 66 #4-23");
    assert.equal(result.pendingCitizenReport.address, "Cra 66 #4-23");
    assert.equal(result.pendingCitizenReport.status, "collecting_photo");
    assert.match(result.reply, /Cra 66 #4-23/);
    assert.match(result.reply, /incendio/i);
    assert.doesNotMatch(result.reply, /No tengo informaci[oÃ³]n oficial/i);
  }
});

test("foto despues de reporte pendiente queda asociada al flujo", async () => {
  const pending = {
    ...buildPendingCitizenReport({
      intent: detectCitizenReportIntent("hay un incendio en el porvenir"),
      description: "hay un incendio en el porvenir",
      language: "es",
    }),
    status: "collecting_photo" as const,
    needsLocation: false,
    address: "Cra 66 #4-23",
  };
  const result = await handlePendingCitizenReportFollowup({
    pendingCitizenReport: pending,
    text: "",
    hasImage: true,
    images: [
      {
        url: "https://cdn.example.com/reporte-incendio.jpg",
        filename: "reporte-incendio.jpg",
        mimeType: "image/jpeg",
      },
    ],
    language: "es",
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.equal(result.attachedPhoto, true);
    assert.equal(result.pendingCitizenReport.status, "submitted");
    assert.match(result.reply, /foto/i);
  }
});

test("no tengo foto cierra el reporte pendiente sin foto", async () => {
  const pending = {
    ...buildPendingCitizenReport({
      intent: detectCitizenReportIntent("hay un accidente en llanogrande"),
      description: "hay un accidente en llanogrande",
      language: "es",
    }),
    status: "collecting_photo" as const,
    needsLocation: false,
    address: "Cra 10 #20-30",
  };
  const result = await handlePendingCitizenReportFollowup({
    pendingCitizenReport: pending,
    text: "no tengo foto",
    language: "es",
  });

  assert.equal(result.handled, true);

  if (result.handled) {
    assert.equal(result.completedWithoutPhoto, true);
    assert.equal(result.pendingCitizenReport.status, "submitted");
    assert.match(result.reply, /sin foto/i);
  }
});

test("detectores reconocen direccion rara y follow-ups cortos", () => {
  const address = detectAddressOrLocationFollowup('cra66Â·"4-23');

  assert.equal(address.isAddressLike, true);
  assert.equal(address.normalizedAddress, "Cra 66 #4-23");
  assert.equal(detectShortFollowUp("where...."), true);
  assert.equal(detectShortFollowUp("en el porvenir"), true);
});
