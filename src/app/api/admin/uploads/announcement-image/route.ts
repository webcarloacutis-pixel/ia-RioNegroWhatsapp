import { NextResponse } from "next/server";

import { assertAdminApiRequest } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { assertRequestBodyPolicy } from "@/lib/request-security";
import {
  MAX_ANNOUNCEMENT_IMAGE_BYTES,
  uploadAnnouncementImage,
} from "@/server/storage-service";

export const runtime = "nodejs";

const MULTIPART_UPLOAD_LIMIT_BYTES = MAX_ANNOUNCEMENT_IMAGE_BYTES + 250_000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  try {
    assertAdminApiRequest(request);
    assertRequestBodyPolicy(request, {
      allowedContentTypes: ["multipart/form-data"],
      maxBytes: MULTIPART_UPLOAD_LIMIT_BYTES,
    });

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError("Archivo requerido.", 400);
    }

    const image = await uploadAnnouncementImage(file);

    return NextResponse.json({ ok: true, image });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.status);
    }

    console.error("[uploads] announcement image failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return jsonError("No se pudo subir la imagen.", 500);
  }
}
