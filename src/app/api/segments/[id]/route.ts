import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { segmentInputSchema } from "@/lib/validations";
import { deleteSegment, updateSegment } from "@/server/panel-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    const payload = await parseRequestBody(request, segmentInputSchema);
    return ok(await updateSegment(id, payload));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await deleteSegment(id));
  } catch (error) {
    return handleApiError(error);
  }
}
