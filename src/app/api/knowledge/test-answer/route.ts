import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { knowledgeTestAnswerSchema } from "@/lib/validations";
import { testKnowledgeAnswer } from "@/server/panel-service";

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, knowledgeTestAnswerSchema);
    return ok(await testKnowledgeAnswer(payload));
  } catch (error) {
    return handleApiError(error);
  }
}
