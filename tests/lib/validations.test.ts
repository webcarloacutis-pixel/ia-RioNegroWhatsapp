import test from "node:test";
import assert from "node:assert/strict";

import {
  announcementInputSchema,
  knowledgeInputSchema,
  loginSchema,
  segmentInputSchema,
} from "@/lib/validations";

test("loginSchema valida credenciales basicas", () => {
  const payload = loginSchema.parse({
    email: "admin@rionegro.gov",
    password: "segura123",
  });

  assert.equal(payload.email, "admin@rionegro.gov");
});

test("announcementInputSchema normaliza tipo y campos opcionales", () => {
  const payload = announcementInputSchema.parse({
    title: "Cierre preventivo",
    message: "Habra cierre preventivo en la via principal por mantenimiento.",
    location: "",
    type: "cierre vial",
    scheduledAt: "2026-04-20T10:00",
    segmentId: "",
  });

  assert.equal(payload.type, "CIERRE_VIAL");
  assert.equal(payload.location, null);
  assert.equal(payload.segmentId, null);
  assert.equal(payload.imageUrl, null);
});

test("announcementInputSchema acepta metadatos de flyer Cloudinary", () => {
  const payload = announcementInputSchema.parse({
    title: "Jornada de salud",
    message: "Habra jornada de salud gratuita para la comunidad este viernes.",
    location: "Parque principal",
    type: "salud publica",
    scheduledAt: "2026-04-20T10:00",
    segmentId: null,
    imageUrl: "https://res.cloudinary.com/demo/image/upload/flyer.png",
    imagePublicId: "rionegro/announcements/flyer",
    imageFilename: "flyer.png",
    imageMimeType: "image/png",
    imageSize: 1024,
    imageProvider: "cloudinary",
  });

  assert.equal(payload.imageUrl, "https://res.cloudinary.com/demo/image/upload/flyer.png");
  assert.equal(payload.imageMimeType, "image/png");
  assert.equal(payload.imageProvider, "cloudinary");
});

test("announcementInputSchema acepta metadatos de audio Cloudinary", () => {
  const payload = announcementInputSchema.parse({
    title: "Mensaje del alcalde",
    message: "Audio institucional para la comunidad de Rionegro.",
    location: "Rionegro",
    type: "comunicado",
    scheduledAt: "2026-04-20T10:00",
    segmentId: null,
    audioUrl: "https://res.cloudinary.com/demo/video/upload/rionegro/announcements/audio/mensaje.mp3",
    audioPublicId: "rionegro/announcements/audio/mensaje",
    audioFilename: "mensaje.mp3",
    audioMimeType: "audio/mpeg",
    audioSize: 1024,
    audioDuration: 45,
    audioProvider: "cloudinary",
  });

  assert.equal(payload.audioMimeType, "audio/mpeg");
  assert.equal(payload.audioProvider, "cloudinary");
  assert.equal(payload.audioDuration, 45);
});

test("announcementInputSchema rechaza metadatos de audio no permitidos", () => {
  assert.throws(() =>
    announcementInputSchema.parse({
      title: "Mensaje del alcalde",
      message: "Audio institucional para la comunidad de Rionegro.",
      location: "Rionegro",
      type: "comunicado",
      scheduledAt: "2026-04-20T10:00",
      segmentId: null,
      audioUrl: "http://localhost/audio.mp3",
      audioPublicId: "rionegro/announcements/audio/mensaje",
      audioFilename: "mensaje.mp3",
      audioMimeType: "audio/mpeg",
      audioSize: 1024,
      audioProvider: "cloudinary",
    }),
  );

  assert.throws(() =>
    announcementInputSchema.parse({
      title: "Mensaje del alcalde",
      message: "Audio institucional para la comunidad de Rionegro.",
      location: "Rionegro",
      type: "comunicado",
      scheduledAt: "2026-04-20T10:00",
      segmentId: null,
      audioUrl: "https://res.cloudinary.com/demo/video/upload/audio.exe",
      audioPublicId: "rionegro/announcements/audio/mensaje",
      audioFilename: "audio.exe",
      audioMimeType: "application/x-msdownload",
      audioSize: 1024,
      audioProvider: "cloudinary",
    }),
  );
});

test("announcementInputSchema rechaza metadatos de imagen no permitidos", () => {
  assert.throws(() =>
    announcementInputSchema.parse({
      title: "Jornada de salud",
      message: "Habra jornada de salud gratuita para la comunidad este viernes.",
      location: "Parque principal",
      type: "salud publica",
      scheduledAt: "2026-04-20T10:00",
      segmentId: null,
      imageUrl: "https://example.com/flyer.svg",
      imagePublicId: "rionegro/announcements/flyer",
      imageFilename: "flyer.svg",
      imageMimeType: "image/svg+xml",
      imageSize: 1024,
      imageProvider: "cloudinary",
    }),
  );

  assert.throws(() =>
    announcementInputSchema.parse({
      title: "Jornada de salud",
      message: "Habra jornada de salud gratuita para la comunidad este viernes.",
      location: "Parque principal",
      type: "salud publica",
      scheduledAt: "2026-04-20T10:00",
      segmentId: null,
      imageUrl: "http://localhost/flyer.png",
      imagePublicId: "rionegro/announcements/flyer",
      imageFilename: "flyer.png",
      imageMimeType: "image/png",
      imageSize: 1024,
      imageProvider: "cloudinary",
    }),
  );
});

test("segmentInputSchema limpia y deduplica numeros", () => {
  const payload = segmentInputSchema.parse({
    name: "Movilidad",
    description: "Conductores",
    estimatedUsers: "250",
    recipientPhones: "+57 310 8853250\n3108853250, +57 316 2215323;3234725938",
  });

  assert.deepEqual(payload.recipientPhones, [
    "+573108853250",
    "+573162215323",
    "+573234725938",
  ]);
  assert.equal(payload.estimatedUsers, 250);
});

test("knowledgeInputSchema exige datos minimos", () => {
  const payload = knowledgeInputSchema.parse({
    question: "Donde queda movilidad?",
    answer: "Movilidad queda en Carrera 48 # 47-19.",
    category: "Movilidad",
  });

  assert.equal(payload.category, "Movilidad");
});

test("knowledgeInputSchema acepta metadatos administrativos", () => {
  const payload = knowledgeInputSchema.parse({
    question: "Donde queda la Alcaldia?",
    answer: "La Alcaldia queda en el centro de Rionegro.",
    category: "Ubicacion",
    intent: "LOCATION",
    shortAnswer: "La Alcaldia queda en el centro de Rionegro.",
    tags: "alcaldia, ubicacion",
    aliases: ["palacio municipal", "alcaldia"],
    sourceUrl: "https://rionegro.gov.co/",
    sourceName: "Sitio oficial Alcaldia de Rionegro",
    sourceType: "official_website",
    isOfficial: true,
    isActive: true,
    needsReview: true,
    confidence: 0.9,
    lastVerifiedAt: "2026-06-05T10:00:00.000Z",
  });

  assert.equal(payload.intent, "LOCATION");
  assert.deepEqual(payload.tags, ["alcaldia", "ubicacion"]);
  assert.equal(payload.isOfficial, true);
  assert.equal(payload.needsReview, true);
  assert.equal(payload.confidence, 0.9);
  assert.ok(payload.lastVerifiedAt instanceof Date);
});

test("knowledgeInputSchema acepta ficha simple sin metadatos tecnicos", () => {
  const payload = knowledgeInputSchema.parse({
    question: "Donde queda el restaurante Las Delicias?",
    answer: "El restaurante Las Delicias queda en el centro de Rionegro.",
    category: "Restaurantes",
  });

  assert.equal(payload.question, "Donde queda el restaurante Las Delicias?");
  assert.equal(payload.answer, "El restaurante Las Delicias queda en el centro de Rionegro.");
  assert.equal(payload.category, "Restaurantes");
  assert.equal(payload.sourceType, "manual_admin");
  assert.equal(payload.confidence, 0.8);
  assert.deepEqual(payload.tags, []);
  assert.deepEqual(payload.aliases, []);
});

test("knowledgeInputSchema rechaza confianza fuera de rango", () => {
  assert.throws(() =>
    knowledgeInputSchema.parse({
      question: "Donde queda la Alcaldia?",
      answer: "La Alcaldia queda en el centro de Rionegro.",
      category: "Ubicacion",
      confidence: 1.5,
    }),
  );
});
