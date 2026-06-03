import test from "node:test";
import assert from "node:assert/strict";

import {
  authInternals,
  maskEmail,
  validateAdminCredentials,
} from "@/lib/auth";
import { resetRateLimit } from "@/lib/rate-limit";
import { POST as loginPost } from "@/app/api/auth/login/route";

test("validateAdminCredentials acepta credenciales configuradas y rechaza incorrectas", () => {
  const previousEmail = process.env.ADMIN_EMAIL;
  const previousPassword = process.env.ADMIN_PASSWORD;

  process.env.ADMIN_EMAIL = "admin@rionegro.gov";
  process.env.ADMIN_PASSWORD = "clave-segura";

  try {
    assert.equal(validateAdminCredentials("admin@rionegro.gov", "clave-segura"), true);
    assert.equal(validateAdminCredentials("admin@rionegro.gov", "mala"), false);
    assert.equal(validateAdminCredentials("otro@rionegro.gov", "clave-segura"), false);
  } finally {
    if (previousEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = previousEmail;
    }

    if (previousPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = previousPassword;
    }
  }
});

test("cookie de sesion firmada valida firma, expiracion y cookie legacy temporal", () => {
  const previousSecret = process.env.SESSION_SECRET;
  const previousEmail = process.env.ADMIN_EMAIL;

  process.env.SESSION_SECRET = "unit-test-session-secret";
  process.env.ADMIN_EMAIL = "admin@rionegro.gov";

  try {
    const now = Date.now();
    const cookie = authInternals.createSignedSessionCookieValue(now);
    const valid = authInternals.verifySignedSessionCookieValue(cookie, now + 1000);
    const expired = authInternals.verifySignedSessionCookieValue(
      cookie,
      now + authInternals.SESSION_MAX_AGE_SECONDS * 1000 + 1,
    );
    const tampered = authInternals.verifySignedSessionCookieValue(`${cookie}x`, now + 1000);
    const legacy = authInternals.verifySignedSessionCookieValue(
      authInternals.LEGACY_AUTH_COOKIE_VALUE,
      now,
    );

    assert.equal(valid.valid, true);
    assert.equal(valid.legacy, false);
    assert.equal(expired.valid, false);
    assert.equal(tampered.valid, false);
    assert.equal(legacy.valid, true);
    assert.equal(legacy.legacy, true);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previousSecret;
    }

    if (previousEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = previousEmail;
    }
  }
});

test("maskEmail no expone correo completo en logs", () => {
  assert.equal(maskEmail("admin@rionegro.gov"), "ad***n@rionegro.gov");
  assert.equal(maskEmail("x@y.com"), "x***@y.com");
  assert.equal(maskEmail("sin-correo"), "invalid-email");
});

test("login rate limit bloquea el sexto intento por IP", async () => {
  const previousEmail = process.env.ADMIN_EMAIL;
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousRateLimit = process.env.RATE_LIMIT_ENABLED;
  const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;

  process.env.ADMIN_EMAIL = "admin@rionegro.gov";
  process.env.ADMIN_PASSWORD = "clave-segura";
  process.env.RATE_LIMIT_ENABLED = "true";
  resetRateLimit(`login:${ip}`);

  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await loginPost(
        new Request("http://localhost:3030/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({
            email: "admin@rionegro.gov",
            password: "incorrecta",
          }),
        }),
      );

      assert.equal(response.status, 401);
    }

    const blocked = await loginPost(
      new Request("http://localhost:3030/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          email: "admin@rionegro.gov",
          password: "incorrecta",
        }),
      }),
    );
    const body = (await blocked.json()) as { ok?: boolean; error?: string };

    assert.equal(blocked.status, 429);
    assert.equal(body.ok, false);
    assert.match(body.error ?? "", /Demasiados intentos/i);
  } finally {
    resetRateLimit(`login:${ip}`);

    if (previousEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = previousEmail;
    }

    if (previousPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = previousPassword;
    }

    if (previousRateLimit === undefined) {
      delete process.env.RATE_LIMIT_ENABLED;
    } else {
      process.env.RATE_LIMIT_ENABLED = previousRateLimit;
    }
  }
});
