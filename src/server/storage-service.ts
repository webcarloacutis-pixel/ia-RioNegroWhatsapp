import { randomBytes } from "node:crypto";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { AppError } from "@/lib/errors";

export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 5 * 1024 * 1024;

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

const DEFAULT_CLOUDINARY_FOLDER = "rionegro/announcements";
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
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

function getCloudinaryFolder() {
  return process.env.CLOUDINARY_FOLDER?.trim() || DEFAULT_CLOUDINARY_FOLDER;
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

export async function uploadAnnouncementImage(
  file: UploadableFile,
): Promise<AnnouncementImageUploadResult> {
  assertCloudinaryConfigured();

  const image = await validateAnnouncementImageFile(file);
  return uploadToCloudinary(image);
}

export const storageServiceInternals = {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  DEFAULT_CLOUDINARY_FOLDER,
  assertCloudinaryConfigured,
  detectImageMimeType,
  getCloudinaryFolder,
  getExtension,
  isCloudinaryConfigured,
  isCloudinaryMockMode,
  sanitizeFilename,
  validateAnnouncementImageFile,
};
