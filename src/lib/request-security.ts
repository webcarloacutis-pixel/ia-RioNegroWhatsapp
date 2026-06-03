import { AppError } from "@/lib/errors";

export const JSON_BODY_LIMIT_BYTES = 200_000;
export const WEBHOOK_BODY_LIMIT_BYTES = 2_000_000;

type RequestBodyPolicy = {
  allowedContentTypes: string[];
  allowMissingContentType?: boolean;
  maxBytes: number;
};

function getBaseContentType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function getContentLength(request: Request) {
  const rawLength = request.headers.get("content-length");

  if (!rawLength) {
    return null;
  }

  const length = Number(rawLength);
  return Number.isFinite(length) && length >= 0 ? length : null;
}

export function assertRequestBodyPolicy(request: Request, policy: RequestBodyPolicy) {
  const contentType = getBaseContentType(request.headers.get("content-type"));

  if (!contentType && !policy.allowMissingContentType) {
    throw new AppError("Content-Type requerido.", 415);
  }

  if (contentType && !policy.allowedContentTypes.includes(contentType)) {
    throw new AppError("Content-Type no soportado.", 415);
  }

  const contentLength = getContentLength(request);

  if (contentLength !== null && contentLength > policy.maxBytes) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }
}

export async function readRequestTextWithLimit(request: Request, maxBytes: number) {
  const text = await request.text();

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }

  return text;
}
