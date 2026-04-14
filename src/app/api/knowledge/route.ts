import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { knowledgeInputSchema } from "@/lib/validations";
import {
  createKnowledgeEntry,
  listKnowledgeEntries,
} from "@/server/panel-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    return ok(await listKnowledgeEntries());
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
