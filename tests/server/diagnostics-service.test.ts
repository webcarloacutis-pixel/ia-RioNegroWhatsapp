import test from "node:test";
import assert from "node:assert/strict";

import { getEnvDiagnostics } from "@/server/diagnostics-service";

test("env diagnostics no expone valores secretos", () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    ULTRAMSG_TOKEN: process.env.ULTRAMSG_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  };

  process.env.DATABASE_URL = "postgresql://user:password@db.example.com:5432/app";
  process.env.ULTRAMSG_TOKEN = "token-real";
  process.env.OPENAI_API_KEY = "sk-real";
  process.env.CLOUDINARY_API_SECRET = "cloudinary-secret";
  process.env.CRON_SECRET = "cron-secret";

  try {
    const diagnostics = getEnvDiagnostics();
    const text = JSON.stringify(diagnostics);

    assert.equal(diagnostics.database.DATABASE_URL, true);
    assert.equal(diagnostics.ultramsg.ULTRAMSG_TOKEN, true);
    assert.equal(diagnostics.openai.OPENAI_API_KEY, true);
    assert.equal(diagnostics.cloudinary.CLOUDINARY_API_SECRET, true);
    assert.equal(diagnostics.scheduler.CRON_SECRET, true);
    assert.equal(text.includes("token-real"), false);
    assert.equal(text.includes("sk-real"), false);
    assert.equal(text.includes("cloudinary-secret"), false);
    assert.equal(text.includes("cron-secret"), false);
    assert.equal(text.includes("password"), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
