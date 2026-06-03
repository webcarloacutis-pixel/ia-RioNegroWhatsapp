import { NextResponse } from "next/server";

import { createAdminSession, maskEmail, validateAdminCredentials } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations";

const LOGIN_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`login:${clientIp}`, LOGIN_RATE_LIMIT);

    if (!rateLimit.allowed) {
      console.warn("[security] login rate limited", {
        ip: clientIp,
        retryAfterMs: rateLimit.retryAfterMs,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Demasiados intentos. Intenta de nuevo mas tarde.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
          },
        },
      );
    }

    const payload = await parseRequestBody(request, loginSchema);

    console.log("[security] login attempt", {
      email: maskEmail(payload.email),
      ip: clientIp,
    });

    if (!validateAdminCredentials(payload.email, payload.password)) {
      console.warn("[security] login failed", {
        email: maskEmail(payload.email),
        ip: clientIp,
      });
      throw new AppError("Credenciales invalidas.", 401);
    }

    await createAdminSession();

    console.log("[security] login success", {
      email: maskEmail(payload.email),
      ip: clientIp,
    });

    return ok({
      authenticated: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
