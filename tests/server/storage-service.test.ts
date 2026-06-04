import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ANNOUNCEMENT_AUDIO_BYTES,
  MAX_ANNOUNCEMENT_IMAGE_BYTES,
  storageServiceInternals,
  uploadAnnouncementAudio,
  uploadAnnouncementImage,
} from "@/server/storage-service";

function pngBytes() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
}

function jpegBytes() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function webpBytes() {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
}

function mp3Bytes() {
  return new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

function oggBytes() {
  return new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
}

function m4aBytes() {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
  ]);
}

function createFile(bytes: Uint8Array, name: string, type: string) {
  return new File([bytes], name, { type });
}

test("uploadAnnouncementImage valida y simula Cloudinary sin usar credenciales reales", async () => {
  const previousMock = process.env.CLOUDINARY_MOCK;
  const previousFolder = process.env.CLOUDINARY_FOLDER;

  process.env.CLOUDINARY_MOCK = "true";
  process.env.CLOUDINARY_FOLDER = "tests/announcements";

  try {
    const result = await uploadAnnouncementImage(
      createFile(pngBytes(), "jornada salud.png", "image/png"),
    );

    assert.equal(result.provider, "cloudinary");
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.filename, "jornada-salud.png");
    assert.match(result.secureUrl, /tests\/announcements/);
    assert.match(result.publicId, /^tests\/announcements\//);
  } finally {
    process.env.CLOUDINARY_MOCK = previousMock;
    process.env.CLOUDINARY_FOLDER = previousFolder;
  }
});

test("validateAnnouncementImageFile acepta jpg, png y webp con magic bytes correctos", async () => {
  const jpg = await storageServiceInternals.validateAnnouncementImageFile(
    createFile(jpegBytes(), "flyer.jpg", "image/jpeg"),
  );
  const png = await storageServiceInternals.validateAnnouncementImageFile(
    createFile(pngBytes(), "flyer.png", "image/png"),
  );
  const webp = await storageServiceInternals.validateAnnouncementImageFile(
    createFile(webpBytes(), "flyer.webp", "image/webp"),
  );

  assert.equal(jpg.mimeType, "image/jpeg");
  assert.equal(png.mimeType, "image/png");
  assert.equal(webp.mimeType, "image/webp");
});

test("validateAnnouncementImageFile rechaza extension bloqueada o extension falsa", async () => {
  await assert.rejects(
    () =>
      storageServiceInternals.validateAnnouncementImageFile(
        createFile(pngBytes(), "flyer.svg", "image/png"),
      ),
    /no permitido/i,
  );

  await assert.rejects(
    () =>
      storageServiceInternals.validateAnnouncementImageFile(
        createFile(pngBytes(), "flyer.jpg", "image/png"),
      ),
    /extension/i,
  );
});

test("validateAnnouncementImageFile rechaza MIME falso y archivos de mas de 5 MB", async () => {
  await assert.rejects(
    () =>
      storageServiceInternals.validateAnnouncementImageFile(
        createFile(pngBytes(), "flyer.png", "image/jpeg"),
      ),
    /MIME declarado/i,
  );

  await assert.rejects(
    () =>
      storageServiceInternals.validateAnnouncementImageFile({
        name: "grande.png",
        type: "image/png",
        size: MAX_ANNOUNCEMENT_IMAGE_BYTES + 1,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    /5 MB/i,
  );
});

test("uploadAnnouncementAudio valida y simula Cloudinary sin usar credenciales reales", async () => {
  const previousMock = process.env.CLOUDINARY_MOCK;
  const previousFolder = process.env.CLOUDINARY_FOLDER;

  process.env.CLOUDINARY_MOCK = "true";
  process.env.CLOUDINARY_FOLDER = "tests/announcements";

  try {
    const result = await uploadAnnouncementAudio(
      createFile(mp3Bytes(), "mensaje navidad.mp3", "audio/mpeg"),
    );

    assert.equal(result.provider, "cloudinary");
    assert.equal(result.mimeType, "audio/mpeg");
    assert.equal(result.filename, "mensaje-navidad.mp3");
    assert.match(result.secureUrl, /tests\/announcements\/audio/);
    assert.match(result.publicId, /^tests\/announcements\/audio\//);
  } finally {
    process.env.CLOUDINARY_MOCK = previousMock;
    process.env.CLOUDINARY_FOLDER = previousFolder;
  }
});

test("validateAnnouncementAudioFile acepta mp3, m4a y ogg con firmas validas", async () => {
  const mp3 = await storageServiceInternals.validateAnnouncementAudioFile(
    createFile(mp3Bytes(), "audio.mp3", "audio/mpeg"),
  );
  const m4a = await storageServiceInternals.validateAnnouncementAudioFile(
    createFile(m4aBytes(), "audio.m4a", "audio/m4a"),
  );
  const ogg = await storageServiceInternals.validateAnnouncementAudioFile(
    createFile(oggBytes(), "audio.ogg", "audio/ogg"),
  );

  assert.equal(mp3.mimeType, "audio/mpeg");
  assert.equal(m4a.mimeType, "audio/m4a");
  assert.equal(ogg.mimeType, "audio/ogg");
});

test("validateAnnouncementAudioFile rechaza extension peligrosa o tamano mayor a 15 MB", async () => {
  await assert.rejects(
    () =>
      storageServiceInternals.validateAnnouncementAudioFile(
        createFile(mp3Bytes(), "audio.exe", "audio/mpeg"),
      ),
    /No se permite|Solo se permiten/i,
  );

  await assert.rejects(
    () =>
      storageServiceInternals.validateAnnouncementAudioFile({
        name: "grande.mp3",
        type: "audio/mpeg",
        size: MAX_ANNOUNCEMENT_AUDIO_BYTES + 1,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    /15 MB/i,
  );
});
