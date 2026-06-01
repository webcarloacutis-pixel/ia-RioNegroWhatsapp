import { NextResponse } from "next/server";

export const runtime = "nodejs";

function exists(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: exists("DATABASE_URL"),
      OPENAI_API_KEY: exists("OPENAI_API_KEY"),
      ELEVENLABS_API_KEY: exists("ELEVENLABS_API_KEY"),
      ELEVENLABS_VOICE_ID: exists("ELEVENLABS_VOICE_ID"),
      ULTRAMSG_TOKEN: exists("ULTRAMSG_TOKEN"),
      ULTRAMSG_INSTANCE_ID: exists("ULTRAMSG_INSTANCE_ID"),
      ULTRAMSG_BASE_URL: exists("ULTRAMSG_BASE_URL"),
      WHATSAPP_AUDIO_REPLIES:
        process.env.WHATSAPP_AUDIO_REPLIES?.trim() || "undefined",
      WHATSAPP_SAFE_MODE: process.env.WHATSAPP_SAFE_MODE?.trim() || "undefined",
    },
  });
}
