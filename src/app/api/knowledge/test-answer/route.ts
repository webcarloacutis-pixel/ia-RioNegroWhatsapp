import { assertAdminApiSession } from "@/lib/auth";
import { ok, parseRequestBody, withApiLogging } from "@/lib/api";
import { logger } from "@/lib/logger";
import { knowledgeTestAnswerSchema } from "@/lib/validations";
import { testKnowledgeAnswer } from "@/server/panel-service";

export async function POST(request: Request) {
  return withApiLogging(request, { module: "knowledge" }, async (requestId) => {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, knowledgeTestAnswerSchema);
    const result = await testKnowledgeAnswer(payload);

    logger.info("knowledge", "test answer completed", {
      requestId,
      entryId: payload.entryId,
      usedItems: result.usedItems.length,
      confidence: result.confidence,
      wouldSayUnknown: result.wouldSayUnknown,
      answerLength: result.answer.length,
    });

    return ok(result);
  });
}
