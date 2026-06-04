import { NextResponse } from "next/server";

import { assertAdminApiRequest } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { assertRequestBodyPolicy } from "@/lib/request-security";
import {
  MAX_ANNOUNCEMENT_AUDIO_BYTES,
  uploadAnnouncementAudio,
} from "@/server/storage-service";

export const runtime = "nodejs";

const MULTIPART_UPLOAD_LIMIT_BYTES = MAX_ANNOUNCEMENT_AUDIO_BYTES + 250_000;

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

    console.log("[uploads] announcement audio upload requested");

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError("Archivo requerido.", 400);
    }

    const audio = await uploadAnnouncementAudio(file);

    console.log("[uploads] announcement audio uploaded", {
      provider: audio.provider,
      mimeType: audio.mimeType,
      size: audio.size,
    });

    return NextResponse.json({ ok: true, audio });
  } catch (error) {
    if (error instanceof AppError) {
      console.warn("[uploads] invalid audio rejected", {
        status: error.status,
        message: error.message,
      });

      return jsonError(error.message, error.status);
    }

    console.error("[uploads] announcement audio failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return jsonError("No se pudo subir el audio.", 500);
  }
}
