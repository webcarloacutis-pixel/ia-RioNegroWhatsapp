import { NextResponse } from "next/server";

import { createAdminSession, maskEmail, validateAdminCredentials } from "@/lib/auth";
import { getOrCreateRequestId, handleApiError, ok, parseRequestBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations";

const LOGIN_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  try {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`login:${clientIp}`, LOGIN_RATE_LIMIT);

    if (!rateLimit.allowed) {
      logger.warn("security", "login rate limited", {
        requestId,
        ip: clientIp,
        retryAfterMs: rateLimit.retryAfterMs,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Demasiados intentos. Intenta de nuevo mas tarde.",
          requestId,
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

    logger.info("security", "login attempt", {
      requestId,
      email: maskEmail(payload.email),
      ip: clientIp,
    });

    if (!validateAdminCredentials(payload.email, payload.password)) {
      logger.warn("security", "login failed", {
        requestId,
        email: maskEmail(payload.email),
        ip: clientIp,
      });
      throw new AppError("Credenciales invalidas.", 401);
    }

    await createAdminSession();

    logger.info("security", "login success", {
      requestId,
      email: maskEmail(payload.email),
      ip: clientIp,
    });

    return ok({
      authenticated: true,
      requestId,
    });
  } catch (error) {
    return handleApiError(error, { requestId, module: "security" });
  }
}
