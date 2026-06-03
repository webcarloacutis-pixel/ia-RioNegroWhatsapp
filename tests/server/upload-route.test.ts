import test from "node:test";
import assert from "node:assert/strict";

import { authInternals } from "@/lib/auth";
import { POST } from "@/app/api/admin/uploads/announcement-image/route";

function pngFile() {
  return new File(
    [
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]),
    ],
    "flyer.png",
    { type: "image/png" },
  );
}

test("POST /api/admin/uploads/announcement-image exige sesion admin", async () => {
  const formData = new FormData();
  formData.set("file", pngFile());

  const response = await POST(
    new Request("http://localhost/api/admin/uploads/announcement-image", {
      method: "POST",
      body: formData,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
});

test("POST /api/admin/uploads/announcement-image sube imagen valida en modo mock", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  const previousMock = process.env.CLOUDINARY_MOCK;
  const previousFolder = process.env.CLOUDINARY_FOLDER;

  process.env.SESSION_SECRET = "test-secret-for-upload-route";
  process.env.CLOUDINARY_MOCK = "true";
  process.env.CLOUDINARY_FOLDER = "tests/announcements";

  try {
    const formData = new FormData();
    formData.set("file", pngFile());

    const cookie = `${authInternals.AUTH_COOKIE_NAME}=${authInternals.createSignedSessionCookieValue()}`;
    const response = await POST(
      new Request("http://localhost/api/admin/uploads/announcement-image", {
        method: "POST",
        headers: {
          cookie,
        },
        body: formData,
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.image.provider, "cloudinary");
    assert.equal(payload.image.mimeType, "image/png");
  } finally {
    process.env.SESSION_SECRET = previousSecret;
    process.env.CLOUDINARY_MOCK = previousMock;
    process.env.CLOUDINARY_FOLDER = previousFolder;
  }
});
