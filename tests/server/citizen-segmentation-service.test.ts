import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_RIONEGRENSES_SEGMENT_NAME,
  mergeRecipientPhones,
  normalizeCitizenPhoneForSegment,
} from "@/server/citizen-segmentation-service";

test("normalizeCitizenPhoneForSegment normaliza numeros colombianos", () => {
  assert.equal(normalizeCitizenPhoneForSegment("+57 310 885 3158"), "+573108853158");
  assert.equal(normalizeCitizenPhoneForSegment("3108853158"), "+573108853158");
  assert.equal(normalizeCitizenPhoneForSegment("573108853158@c.us"), "+573108853158");
  assert.equal(normalizeCitizenPhoneForSegment(""), null);
});

test("mergeRecipientPhones agrega sin duplicar", () => {
  const merged = mergeRecipientPhones(
    ["+573108853158", " 310 885 3158 ", "+573001112233"],
    "573108853158",
  );

  assert.deepEqual(merged, ["+573108853158", "+573001112233"]);
});

test("segmento automatico conserva nombre publico esperado", () => {
  assert.equal(ALL_RIONEGRENSES_SEGMENT_NAME, "Todos los rionegrenses");
});
