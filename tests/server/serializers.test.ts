import test from "node:test";
import assert from "node:assert/strict";

import {
  serializeAnnouncement,
  serializeDeliveryLog,
  serializeKnowledgeEntry,
  serializeSegment,
} from "@/server/serializers";

test("serializeAnnouncement expone los campos esperados para el panel", () => {
  const payload = serializeAnnouncement({
    id: "ann-1",
    title: "Prueba",
    message: "Mensaje",
    location: "Centro",
    type: "NEWS",
    customTypeLabel: "Boletin especial",
    scheduledAt: new Date("2026-04-20T10:00:00.000Z"),
    imageUrl: "https://res.cloudinary.com/demo/image/upload/flyer.png",
    imagePublicId: "rionegro/announcements/flyer",
    imageFilename: "flyer.png",
    imageMimeType: "image/png",
    imageSize: 1024,
    imageProvider: "cloudinary",
    audioUrl: "https://res.cloudinary.com/demo/video/upload/audio.mp3",
    audioPublicId: "rionegro/announcements/audio/audio",
    audioFilename: "audio.mp3",
    audioMimeType: "audio/mpeg",
    audioSize: 2048,
    audioDuration: 35,
    audioProvider: "cloudinary",
    status: "SCHEDULED",
    sentAt: null,
    createdAt: new Date("2026-04-19T08:00:00.000Z"),
    updatedAt: new Date("2026-04-19T08:00:00.000Z"),
    segmentId: "seg-1",
    segment: {
      id: "seg-1",
      name: "Cobertura municipal",
      estimatedUsers: 500,
    },
  } as never);

  assert.equal(payload.displayType, "Boletin especial");
  assert.equal(payload.segment?.name, "Cobertura municipal");
  assert.equal(payload.imageProvider, "cloudinary");
  assert.equal(payload.imageFilename, "flyer.png");
  assert.equal(payload.audioProvider, "cloudinary");
  assert.equal(payload.audioFilename, "audio.mp3");
  assert.equal(payload.audioDuration, 35);
});

test("serializeSegment calcula conteos y ultima fecha de uso", () => {
  const payload = serializeSegment({
    id: "seg-1",
    name: "Movilidad",
    description: "Conductores",
    estimatedUsers: 300,
    recipientPhones: ["+573108853250", "+573162215323"],
    createdAt: new Date("2026-04-18T08:00:00.000Z"),
    updatedAt: new Date("2026-04-18T08:00:00.000Z"),
    _count: { announcements: 4 },
    deliveryLogs: [{ createdAt: new Date("2026-04-20T10:00:00.000Z") }],
  } as never);

  assert.equal(payload.recipientCount, 2);
  assert.equal(payload.activeAnnouncements, 4);
  assert.equal(payload.lastUsedAt, "2026-04-20T10:00:00.000Z");
});

test("serializeKnowledgeEntry y serializeDeliveryLog generan salidas estables", () => {
  const knowledge = serializeKnowledgeEntry({
    id: "kb-1",
    question: "Donde queda hacienda?",
    answer: "Hacienda queda en el Palacio Municipal.",
    category: "Hacienda",
    createdAt: new Date("2026-04-18T08:00:00.000Z"),
    updatedAt: new Date("2026-04-18T09:00:00.000Z"),
  } as never);

  const delivery = serializeDeliveryLog({
    id: "log-1",
    mode: "MANUAL",
    status: "SUCCESS",
    deliveredCount: 3,
    details: "Enviado correctamente",
    createdAt: new Date("2026-04-20T10:00:00.000Z"),
    announcement: {
      id: "ann-1",
      title: "Boletin",
    },
    segment: {
      name: "Movilidad",
    },
  } as never);

  assert.equal(knowledge.id, "kb-1");
  assert.equal(delivery.segmentName, "Movilidad");
  assert.equal(delivery.announcementTitle, "Boletin");
});
