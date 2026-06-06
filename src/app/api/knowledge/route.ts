import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { knowledgeInputSchema } from "@/lib/validations";
import {
  createKnowledgeEntry,
  listKnowledgeDashboard,
} from "@/server/panel-service";

function parseBooleanParam(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseNumberParam(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    await assertAdminApiSession();
    const params = new URL(request.url).searchParams;

    return ok(
      await listKnowledgeDashboard({
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
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, knowledgeInputSchema);
    return ok(await createKnowledgeEntry(payload), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
