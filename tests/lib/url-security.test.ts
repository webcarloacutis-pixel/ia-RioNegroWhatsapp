import test from "node:test";
import assert from "node:assert/strict";

import { isPublicHttpUrl } from "@/lib/url-security";

test("isPublicHttpUrl permite URLs publicas y bloquea localhost o redes privadas", () => {
  assert.equal(isPublicHttpUrl("https://cdn.example.com/reporte.jpg"), true);
  assert.equal(isPublicHttpUrl("http://localhost/reporte.jpg"), false);
  assert.equal(isPublicHttpUrl("http://127.0.0.1/reporte.jpg"), false);
  assert.equal(isPublicHttpUrl("http://10.0.0.5/reporte.jpg"), false);
  assert.equal(isPublicHttpUrl("http://192.168.1.4/reporte.jpg"), false);
  assert.equal(isPublicHttpUrl("ftp://cdn.example.com/reporte.jpg"), false);
});
