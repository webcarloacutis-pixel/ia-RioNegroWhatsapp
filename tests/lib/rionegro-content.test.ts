import test from "node:test";
import assert from "node:assert/strict";

import { buildOfficialKnowledgeEntries } from "@/lib/rionegro-content";

test("buildOfficialKnowledgeEntries incluye la informacion ciudadana importada", () => {
  const entries = buildOfficialKnowledgeEntries();

  assert.ok(entries.length >= 245);
  assert.ok(
    entries.some((entry) => entry.question === "Contacto de emergencia: Bomberos Rionegro"),
  );
  assert.ok(
    entries.some((entry) => entry.question === "Restaurante en Rionegro: Crepes & Waffles"),
  );
  assert.ok(
    entries.some((entry) =>
      entry.question.toLowerCase().includes("impuesto predial unificado"),
    ),
  );
  assert.equal(entries.filter((entry) => entry.category === "Eventos").length, 12);
});
