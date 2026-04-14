import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { segmentInputSchema } from "@/lib/validations";
import { createSegment, listSegments } from "@/server/panel-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    return ok(await listSegments());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, segmentInputSchema);
    return ok(await createSegment(payload), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
