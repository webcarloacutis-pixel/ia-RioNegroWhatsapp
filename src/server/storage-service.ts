import { randomBytes } from "node:crypto";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { AppError } from "@/lib/errors";
import { logger, sanitizeError } from "@/lib/logger";

export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ANNOUNCEMENT_AUDIO_BYTES = 15 * 1024 * 1024;

export type AnnouncementImageUploadResult = {
  url: string;
  secureUrl: string;
  publicId: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  provider: "cloudinary";
};

export type AnnouncementAudioUploadResult = {
  url: string;
  secureUrl: string;
  publicId: string;
  filename: string;
  mimeType: AllowedAnnouncementAudioMimeType;
  size: number;
  duration?: number;
  provider: "cloudinary";
};

type UploadableFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type ValidatedAnnouncementImage = {
  buffer: Buffer;
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "jpeg" | "png" | "webp";
  size: number;
};

type AllowedAnnouncementAudioMimeType =
  | "audio/mpeg"
  | "audio/mp3"
  | "audio/mp4"
  | "audio/m4a"
  | "audio/ogg"
  | "audio/wav"
  | "audio/webm"
  | "audio/aac";

type ValidatedAnnouncementAudio = {
  buffer: Buffer;
  filename: string;
  mimeType: AllowedAnnouncementAudioMimeType;
  extension: "mp3" | "m4a" | "ogg" | "oga" | "wav" | "webm" | "aac";
  size: number;
};

const DEFAULT_CLOUDINARY_FOLDER = "rionegro/announcements";
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "ogg", "oga", "wav", "webm", "aac"]);
const BLOCKED_EXTENSIONS = new Set([
  "bat",
  "cmd",
  "exe",
  "html",
  "js",
  "pdf",
  "php",
  "rar",
  "sh",
  "svg",
  "zip",
]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_AUDIO_MIME_TYPES = new Set<AllowedAnnouncementAudioMimeType>([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
]);

function getCloudinaryFolder() {
  return process.env.CLOUDINARY_FOLDER?.trim() || DEFAULT_CLOUDINARY_FOLDER;
}

function getCloudinaryAudioFolder() {
  return `${getCloudinaryFolder().replace(/\/+$/, "")}/audio`;
}

function isCloudinaryMockMode() {
  return process.env.CLOUDINARY_MOCK === "true";
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

function assertCloudinaryConfigured() {
  if (isCloudinaryMockMode()) {
    return;
  }

  if (!isCloudinaryConfigured()) {
    throw new AppError("Cloudinary no esta configurado.", 500);
  }
}

function getExtension(filename: string) {
  const cleanName = filename.split(/[\\/]/).pop()?.trim() ?? "";
  const lastDotIndex = cleanName.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === cleanName.length - 1) {
    return null;
  }

  return cleanName.slice(lastDotIndex + 1).toLowerCase();
}

function sanitizeFilename(filename: string, extension: string) {
  const rawName = filename.split(/[\\/]/).pop()?.trim() || `flyer.${extension}`;
  const withoutControlChars = rawName.replace(/[\u0000-\u001f\u007f]/g, "");
  const normalized = withoutControlChars
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 180);

  return normalized || `flyer.${extension}`;
}

function detectImageMimeType(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function normalizeAudioMimeType(value: string) {
  return value === "audio/mp3" ? "audio/mpeg" : value;
}

function detectAudioMimeType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
    return "audio/mpeg";
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "audio/ogg";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "audio/webm";
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "audio/mp4";
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] === 0xf1 || buffer[1] === 0xf9)) {
    return "audio/aac";
  }

  return null;
}

function audioMimeTypesMatch(detectedMimeType: string, declaredMimeType: string) {
  const detected = normalizeAudioMimeType(detectedMimeType);
  const declared = normalizeAudioMimeType(declaredMimeType);

  return detected === declared || (detected === "audio/mp4" && declared === "audio/m4a");
}

function assertExtensionIsAllowed(extension: string | null) {
  if (!extension) {
    throw new AppError("El archivo debe tener extension jpg, jpeg, png o webp.", 400);
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new AppError("Tipo de archivo no permitido para comunicados.", 400);
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new AppError("Solo se permiten imagenes jpg, jpeg, png o webp.", 400);
  }
}

function assertMimeTypeMatchesExtension(mimeType: string, extension: string) {
  if (extension === "jpg" || extension === "jpeg") {
    if (mimeType !== "image/jpeg") {
      throw new AppError("La extension del archivo no coincide con su contenido.", 400);
    }

    return;
  }

  if (extension === "png" && mimeType !== "image/png") {
    throw new AppError("La extension del archivo no coincide con su contenido.", 400);
  }

  if (extension === "webp" && mimeType !== "image/webp") {
    throw new AppError("La extension del archivo no coincide con su contenido.", 400);
  }
}

function assertAudioExtensionIsAllowed(extension: string | null) {
  if (!extension) {
    throw new AppError("El archivo debe tener extension mp3, m4a, ogg, oga, wav, webm o aac.", 400);
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new AppError("No se permite este tipo de archivo.", 400);
  }

  if (!ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    throw new AppError("Solo se permiten audios MP3, M4A, OGG, WAV, WEBM o AAC.", 400);
  }
}

function assertAudioMimeTypeMatchesExtension(mimeType: string, extension: string) {
  const normalizedMime = normalizeAudioMimeType(mimeType);

  if (extension === "mp3" && normalizedMime !== "audio/mpeg") {
    throw new AppError("La extension del audio no coincide con su contenido.", 400);
  }

  if (extension === "m4a" && normalizedMime !== "audio/mp4" && normalizedMime !== "audio/m4a") {
    throw new AppError("La extension del audio no coincide con su contenido.", 400);
  }

  if ((extension === "ogg" || extension === "oga") && normalizedMime !== "audio/ogg") {
    throw new AppError("La extension del audio no coincide con su contenido.", 400);
  }

  if (extension === "wav" && normalizedMime !== "audio/wav") {
    throw new AppError("La extension del audio no coincide con su contenido.", 400);
  }

  if (extension === "webm" && normalizedMime !== "audio/webm") {
    throw new AppError("La extension del audio no coincide con su contenido.", 400);
  }

  if (extension === "aac" && normalizedMime !== "audio/aac") {
    throw new AppError("La extension del audio no coincide con su contenido.", 400);
  }
}

async function validateAnnouncementImageFile(
  file: UploadableFile,
): Promise<ValidatedAnnouncementImage> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new AppError("Archivo requerido.", 400);
  }

  const extension = getExtension(file.name);
  assertExtensionIsAllowed(extension);

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new AppError("MIME de imagen no permitido.", 400);
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new AppError("La imagen esta vacia.", 400);
  }

  if (file.size > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
    throw new AppError("La imagen no puede superar 5 MB.", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
    throw new AppError("La imagen no puede superar 5 MB.", 413);
  }

  const detectedMimeType = detectImageMimeType(buffer);

  if (!detectedMimeType) {
    throw new AppError("El contenido del archivo no corresponde a una imagen valida.", 400);
  }

  if (detectedMimeType !== file.type) {
    throw new AppError("El MIME declarado no coincide con el contenido de la imagen.", 400);
  }

  assertMimeTypeMatchesExtension(detectedMimeType, extension as string);

  return {
    buffer,
    extension: extension as ValidatedAnnouncementImage["extension"],
    filename: sanitizeFilename(file.name, extension as string),
    mimeType: detectedMimeType,
    size: buffer.length,
  };
}

async function validateAnnouncementAudioFile(
  file: UploadableFile,
): Promise<ValidatedAnnouncementAudio> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new AppError("Archivo requerido.", 400);
  }

  const extension = getExtension(file.name);
  assertAudioExtensionIsAllowed(extension);

  if (!ALLOWED_AUDIO_MIME_TYPES.has(file.type as AllowedAnnouncementAudioMimeType)) {
    throw new AppError("Solo se permiten audios MP3, M4A, OGG, WAV, WEBM o AAC.", 400);
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new AppError("El audio esta vacio.", 400);
  }

  if (file.size > MAX_ANNOUNCEMENT_AUDIO_BYTES) {
    throw new AppError("El audio no puede superar 15 MB.", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > MAX_ANNOUNCEMENT_AUDIO_BYTES) {
    throw new AppError("El audio no puede superar 15 MB.", 413);
  }

  const detectedMimeType = detectAudioMimeType(buffer);

  if (!detectedMimeType) {
    throw new AppError("El contenido del archivo no corresponde a un audio valido.", 400);
  }

  if (!audioMimeTypesMatch(detectedMimeType, file.type)) {
    throw new AppError("El MIME declarado no coincide con el contenido del audio.", 400);
  }

  assertAudioMimeTypeMatchesExtension(detectedMimeType, extension as string);

  return {
    buffer,
    extension: extension as ValidatedAnnouncementAudio["extension"],
    filename: sanitizeFilename(file.name, extension as string),
    mimeType: file.type as AllowedAnnouncementAudioMimeType,
    size: buffer.length,
  };
}

function buildPublicId(filename: string) {
  const baseName = filename.replace(/\.[^.]+$/, "");
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${slug || "flyer"}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
    secure: true,
  });
}

function toUploadResult(
  image: ValidatedAnnouncementImage,
  result: Pick<
    UploadApiResponse,
    "url" | "secure_url" | "public_id" | "width" | "height"
  >,
): AnnouncementImageUploadResult {
  return {
    url: result.url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    filename: image.filename,
    mimeType: image.mimeType,
    size: image.size,
    width: result.width,
    height: result.height,
    provider: "cloudinary",
  };
}

function toAudioUploadResult(
  audio: ValidatedAnnouncementAudio,
  result: Pick<UploadApiResponse, "url" | "secure_url" | "public_id"> & {
    duration?: number;
  },
): AnnouncementAudioUploadResult {
  return {
    url: result.url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    filename: audio.filename,
    mimeType: audio.mimeType,
    size: audio.size,
    duration: typeof result.duration === "number" ? Math.round(result.duration) : undefined,
    provider: "cloudinary",
  };
}

async function uploadToCloudinary(
  image: ValidatedAnnouncementImage,
): Promise<AnnouncementImageUploadResult> {
  const folder = getCloudinaryFolder();
  const publicId = buildPublicId(image.filename);

  if (isCloudinaryMockMode()) {
    const mockUrl = `https://res.cloudinary.com/mock/image/upload/${folder}/${publicId}.${image.extension}`;

    return {
      url: mockUrl,
      secureUrl: mockUrl,
      publicId: `${folder}/${publicId}`,
      filename: image.filename,
      mimeType: image.mimeType,
      size: image.size,
      width: 800,
      height: 600,
      provider: "cloudinary",
    };
  }

  configureCloudinary();

  const dataUri = `data:${image.mimeType};base64,${image.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    resource_type: "image",
    overwrite: false,
    unique_filename: false,
    use_filename: false,
  });

  return toUploadResult(image, result);
}

async function uploadAudioToCloudinary(
  audio: ValidatedAnnouncementAudio,
): Promise<AnnouncementAudioUploadResult> {
  const folder = getCloudinaryAudioFolder();
  const publicId = buildPublicId(audio.filename);

  if (isCloudinaryMockMode()) {
    const mockUrl = `https://res.cloudinary.com/mock/video/upload/${folder}/${publicId}.${audio.extension}`;

    return {
      url: mockUrl,
      secureUrl: mockUrl,
      publicId: `${folder}/${publicId}`,
      filename: audio.filename,
      mimeType: audio.mimeType,
      size: audio.size,
      duration: undefined,
      provider: "cloudinary",
    };
  }

  configureCloudinary();

  const dataUri = `data:${audio.mimeType};base64,${audio.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    resource_type: "video",
    overwrite: false,
    unique_filename: false,
    use_filename: false,
  });

  return toAudioUploadResult(audio, result);
}

export async function uploadAnnouncementImage(
  file: UploadableFile,
): Promise<AnnouncementImageUploadResult> {
  logger.info("uploads", "upload requested", {
    fileType: file?.type,
    size: file?.size,
    provider: "cloudinary",
    kind: "image",
  });
  assertCloudinaryConfigured();

  try {
    const image = await validateAnnouncementImageFile(file);
    logger.info("uploads", "cloudinary upload started", {
      fileType: image.mimeType,
      size: image.size,
      provider: "cloudinary",
      folder: getCloudinaryFolder(),
    });
    const result = await uploadToCloudinary(image);
    logger.info("uploads", "cloudinary upload success", {
      fileType: result.mimeType,
      size: result.size,
      provider: result.provider,
      publicId: result.publicId.slice(0, 24),
    });
    return result;
  } catch (error) {
    logger.error("uploads", "cloudinary upload failed", {
      provider: "cloudinary",
      kind: "image",
      error: sanitizeError(error),
    });
    throw error;
  }
}

export async function uploadAnnouncementAudio(
  file: UploadableFile,
): Promise<AnnouncementAudioUploadResult> {
  logger.info("uploads", "upload requested", {
    fileType: file?.type,
    size: file?.size,
    provider: "cloudinary",
    kind: "audio",
  });
  assertCloudinaryConfigured();

  try {
    const audio = await validateAnnouncementAudioFile(file);
    logger.info("uploads", "cloudinary upload started", {
      fileType: audio.mimeType,
      size: audio.size,
      provider: "cloudinary",
      folder: getCloudinaryAudioFolder(),
    });
    const result = await uploadAudioToCloudinary(audio);
    logger.info("uploads", "cloudinary upload success", {
      fileType: result.mimeType,
      size: result.size,
      provider: result.provider,
      publicId: result.publicId.slice(0, 24),
    });
    return result;
  } catch (error) {
    logger.error("uploads", "cloudinary upload failed", {
      provider: "cloudinary",
      kind: "audio",
      error: sanitizeError(error),
    });
    throw error;
  }
}

export async function deleteAnnouncementAudio(publicId?: string | null) {
  if (!publicId) {
    return { deleted: false };
  }

  assertCloudinaryConfigured();

  if (isCloudinaryMockMode()) {
    return { deleted: true, provider: "cloudinary" as const };
  }

  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
  return { deleted: true, provider: "cloudinary" as const };
}

export function isStorageConfigured() {
  return isCloudinaryConfigured() || isCloudinaryMockMode();
}

export const storageServiceInternals = {
  ALLOWED_EXTENSIONS,
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  DEFAULT_CLOUDINARY_FOLDER,
  assertCloudinaryConfigured,
  detectImageMimeType,
  detectAudioMimeType,
  getCloudinaryFolder,
  getCloudinaryAudioFolder,
  getExtension,
  isCloudinaryConfigured,
  isCloudinaryMockMode,
  normalizeAudioMimeType,
  audioMimeTypesMatch,
  sanitizeFilename,
  validateAnnouncementAudioFile,
  validateAnnouncementImageFile,
};
