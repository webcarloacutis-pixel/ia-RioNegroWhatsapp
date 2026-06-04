import test from "node:test";
import assert from "node:assert/strict";

import nextConfig from "../../next.config";

test("next.config define headers de seguridad globales", async () => {
  assert.equal(typeof nextConfig.headers, "function");

  const getHeaders = nextConfig.headers;
  assert.ok(getHeaders);

  const headerRules = await getHeaders();
  const globalRule = headerRules.find((rule) => rule.source === "/:path*");
  assert.ok(globalRule);

  const headers = new Map(globalRule.headers.map((header) => [header.key, header.value]));

  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(headers.get("Strict-Transport-Security") ?? "", /max-age=/);
  assert.match(headers.get("Permissions-Policy") ?? "", /camera=\(\)/);
});
