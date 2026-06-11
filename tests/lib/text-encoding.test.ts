import test from "node:test";
import assert from "node:assert/strict";

import { cleanFinalReplyText, repairMojibake } from "@/lib/text-encoding";

test("repairMojibake corrige textos UTF-8 mal decodificados", () => {
  assert.equal(
    repairMojibake("MantÃ©n trancÃ³n ExplosiÃ³n niÃ±o"),
    "Mantén trancón Explosión niño",
  );
});

test("cleanFinalReplyText conserva tildes y ene en respuesta final espanola", () => {
  const reply = cleanFinalReplyText(
    "No tengo informacion oficial. Manana cumple 2 anos el nino que habla espanol.",
    "es",
  );

  assert.equal(
    reply,
    "No tengo información oficial. Mañana cumple 2 años el niño que habla español.",
  );
});

test("cleanFinalReplyText no reacentua respuestas en ingles", () => {
  assert.equal(
    cleanFinalReplyText("I have official informacion from Rionegro.", "en"),
    "I have official informacion from Rionegro.",
  );
});
