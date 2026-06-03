import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { middleware } from "../../middleware";
import { authInternals } from "@/lib/auth";

function makeRequest(pathname: string, cookieValue?: string) {
  const headers = new Headers();

  if (cookieValue) {
    headers.set("Cookie", `${authInternals.AUTH_COOKIE_NAME}=${cookieValue}`);
  }

  return new NextRequest(new Request(`http://localhost:3030${pathname}`, { headers }));
}

test("middleware redirige dashboard sin cookie a login", () => {
  const response = middleware(makeRequest("/dashboard/base-conocimiento?tab=kb"));

  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/login\?next=/);
});

test("middleware bloquea debug api sin cookie", async () => {
  const response = middleware(makeRequest("/api/debug/env"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 401);
  assert.equal(typeof body.error, "string");
});

test("middleware deja pasar rutas protegidas con cookie y rutas publicas", () => {
  const withCookie = middleware(makeRequest("/dashboard", "signed-cookie-placeholder"));
  const publicRoute = middleware(makeRequest("/api/health"));

  assert.equal(withCookie.status, 200);
  assert.equal(withCookie.headers.get("x-middleware-next"), "1");
  assert.equal(publicRoute.status, 200);
  assert.equal(publicRoute.headers.get("x-middleware-next"), "1");
});
