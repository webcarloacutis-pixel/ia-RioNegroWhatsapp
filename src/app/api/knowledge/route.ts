import { assertAdminApiSession } from "@/lib/auth";
import { ok, parseRequestBody, withApiLogging } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { knowledgeInputSchema } from "@/lib/validations";
import {
  createKnowledgeEntry,
  listKnowledgeDashboard,
} from "@/server/panel-service";

function parseBooleanParam(value: string | null) {
  if (value !== null && value !== "true" && value !== "false") {
    throw new AppError("Parametro booleano invalido.", 400);
  }

  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseNumberParam(value: string | null) {
  if (value !== null && !/^\d+$/.test(value)) {
    throw new AppError("Parametro numerico invalido.", 400);
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const params = new URL(request.url).searchParams;
    const filters = {
      q: params.get("q"),
      category: params.get("category"),
      intent: params.get("intent"),
      sourceType: params.get("sourceType"),
      sourceName: params.get("sourceName"),
      tag: params.get("tag"),
      isActive: parseBooleanParam(params.get("isActive")),
      isOfficial: parseBooleanParam(params.get("isOfficial")),
      needsReview: parseBooleanParam(params.get("needsReview")),
      lowConfidence: parseBooleanParam(params.get("lowConfidence")),
      page: parseNumberParam(params.get("page")),
      pageSize: parseNumberParam(params.get("pageSize")),
    };

    logger.info("knowledge", "filters parsed", {
      requestId,
      filters,
    });

    return ok(
      await listKnowledgeDashboard(filters),
    );
  });
}

export async function POST(request: Request) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, knowledgeInputSchema);
    logger.info("knowledge", "create requested", {
      requestId,
      category: payload.category,
      intent: payload.intent,
      isOfficial: payload.isOfficial,
      isActive: payload.isActive,
    });

    return ok(await createKnowledgeEntry(payload), { status: 201 });
  });
}
