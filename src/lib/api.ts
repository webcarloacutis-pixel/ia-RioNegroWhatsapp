import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { AppError } from "@/lib/errors";
import { createRequestId, logger, sanitizeError, sanitizeLogPayload } from "@/lib/logger";
import {
  JSON_BODY_LIMIT_BYTES,
  assertRequestBodyPolicy,
  readRequestTextWithLimit,
} from "@/lib/request-security";

export async function parseRequestBody<T>(
  request: Request,
  schema: ZodType<T>,
) {
  assertRequestBodyPolicy(request, {
    allowedContentTypes: ["application/json"],
    maxBytes: JSON_BODY_LIMIT_BYTES,
  });

  const rawText = await readRequestTextWithLimit(request, JSON_BODY_LIMIT_BYTES);
  let payload: unknown;

  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new AppError("JSON invalido.", 400);
  }

  return schema.parse(payload);
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

type ApiErrorOptions = {
  requestId?: string;
  module?: string;
  publicMessage?: string;
};

export function getOrCreateRequestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming || createRequestId();
}

export async function withApiLogging(
  request: Request,
  options: {
    module: string;
    logBody?: boolean;
  },
  handler: (requestId: string) => Promise<Response>,
) {
  const requestId = getOrCreateRequestId(request);
  const startedAt = Date.now();
  const url = new URL(request.url);

  logger.info(options.module, "request received", {
    requestId,
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  });

  try {
    const response = await handler(requestId);
    logger.info(options.module, "response sent", {
      requestId,
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    logger.error(options.module, "request failed", {
      requestId,
      method: request.method,
      path: url.pathname,
      durationMs: Date.now() - startedAt,
      error: sanitizeError(error),
    });

    return handleApiError(error, { requestId, module: options.module });
  }
}

export function handleApiError(error: unknown, options: ApiErrorOptions = {}) {
  if (error instanceof ZodError) {
    logger.warn(options.module ?? "api", "validation failed", {
      requestId: options.requestId,
      issues: sanitizeLogPayload(error.issues),
    });

    return NextResponse.json(
      {
        ok: false,
        error: options.publicMessage ?? error.issues[0]?.message ?? "Datos invalidos.",
        requestId: options.requestId,
      },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: options.publicMessage ?? error.message,
        requestId: options.requestId,
      },
      { status: error.status },
    );
  }

  logger.error(options.module ?? "api", "internal error", {
    requestId: options.requestId,
    error: sanitizeError(error),
  });

  return NextResponse.json(
    {
      ok: false,
      error: options.publicMessage ?? "Error interno del servidor.",
      requestId: options.requestId,
    },
    { status: 500 },
  );
}
