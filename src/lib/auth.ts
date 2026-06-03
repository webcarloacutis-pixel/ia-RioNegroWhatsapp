import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD } from "@/lib/constants";
import { AppError } from "@/lib/errors";

const AUTH_COOKIE_NAME = "rionegro_admin_session";
const LEGACY_AUTH_COOKIE_VALUE = "rionegro-demo-authenticated";
const AUTH_COOKIE_VERSION = "v2";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const globalForAuth = globalThis as unknown as {
  __rionegroEphemeralSessionSecret?: string;
  __rionegroSessionSecretWarningShown?: boolean;
};

function getAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim() || ADMIN_DEMO_EMAIL;
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? ADMIN_DEMO_PASSWORD;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  const configured = process.env.SESSION_SECRET?.trim();

  if (configured) {
    return configured;
  }

  if (!globalForAuth.__rionegroEphemeralSessionSecret) {
    globalForAuth.__rionegroEphemeralSessionSecret = randomBytes(32).toString("hex");
  }

  if (!globalForAuth.__rionegroSessionSecretWarningShown) {
    globalForAuth.__rionegroSessionSecretWarningShown = true;
    console.warn("[security] SESSION_SECRET missing; using ephemeral session secret");
  }

  return globalForAuth.__rionegroEphemeralSessionSecret;
}

function signSessionPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getCookieValueFromHeader(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === cookieName) {
      return valueParts.join("=");
    }
  }

  return null;
}

export function maskEmail(value: string) {
  const [localPart = "", domain = ""] = value.trim().split("@");

  if (!localPart || !domain) {
    return "invalid-email";
  }

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}***`
      : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;

  return `${maskedLocal}@${domain}`;
}

export function createSignedSessionCookieValue(now = Date.now()) {
  const payload = {
    email: getAdminEmail(),
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload);

  return `${AUTH_COOKIE_VERSION}.${encodedPayload}.${signature}`;
}

export function verifySignedSessionCookieValue(value?: string | null, now = Date.now()) {
  if (!value) {
    return { valid: false, legacy: false };
  }

  if (value === LEGACY_AUTH_COOKIE_VALUE) {
    return { valid: true, legacy: true };
  }

  const [version, encodedPayload, signature] = value.split(".");

  if (version !== AUTH_COOKIE_VERSION || !encodedPayload || !signature) {
    return { valid: false, legacy: false };
  }

  const expectedSignature = signSessionPayload(encodedPayload);

  if (!safeEqual(signature, expectedSignature)) {
    return { valid: false, legacy: false };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      email?: string;
      expiresAt?: number;
    };

    if (payload.email !== getAdminEmail()) {
      return { valid: false, legacy: false };
    }

    if (!payload.expiresAt || payload.expiresAt <= now) {
      return { valid: false, legacy: false };
    }

    return { valid: true, legacy: false };
  } catch {
    return { valid: false, legacy: false };
  }
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const session = verifySignedSessionCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  const authenticated = session.valid;

  console.log("[auth] session check", {
    authenticated,
    legacy: session.legacy,
  });

  return authenticated;
}

export async function getAdminProfile() {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return null;
  }

  return {
    email: getAdminEmail(),
    role: "Administrador",
  };
}

export async function requireAdminSession() {
  const profile = await getAdminProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}

export async function assertAdminApiSession() {
  const profile = await getAdminProfile();

  if (!profile) {
    throw new AppError("No autorizado. Inicia sesion para continuar.", 401);
  }

  return profile;
}

export function assertAdminApiRequest(request: Request) {
  const cookieValue = getCookieValueFromHeader(
    request.headers.get("cookie"),
    AUTH_COOKIE_NAME,
  );
  const session = verifySignedSessionCookieValue(cookieValue);

  if (!session.valid) {
    throw new AppError("No autorizado. Inicia sesion para continuar.", 401);
  }

  return session;
}

export function validateAdminCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === getAdminEmail().toLowerCase() && password === getAdminPassword();
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE_NAME,
    value: createSignedSessionCookieValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export const authInternals = {
  AUTH_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_VALUE,
  SESSION_MAX_AGE_SECONDS,
  getSessionSecret,
  createSignedSessionCookieValue,
  verifySignedSessionCookieValue,
  getCookieValueFromHeader,
  maskEmail,
};
