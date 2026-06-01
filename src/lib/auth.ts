import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD } from "@/lib/constants";
import { AppError } from "@/lib/errors";

const AUTH_COOKIE_NAME = "rionegro_admin_session";
const AUTH_COOKIE_VALUE = "rionegro-demo-authenticated";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? ADMIN_DEMO_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ADMIN_DEMO_PASSWORD;

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const authenticated = cookieStore.get(AUTH_COOKIE_NAME)?.value === AUTH_COOKIE_VALUE;

  console.log("[auth] session check", {
    authenticated,
  });

  return authenticated;
}

export async function getAdminProfile() {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return null;
  }

  return {
    email: ADMIN_EMAIL,
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

export function validateAdminCredentials(email: string, password: string) {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE_NAME,
    value: AUTH_COOKIE_VALUE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
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
