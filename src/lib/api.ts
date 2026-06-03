import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { AppError } from "@/lib/errors";
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

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos invalidos." },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  return NextResponse.json(
    { error: "Error interno del servidor." },
    { status: 500 },
  );
}
