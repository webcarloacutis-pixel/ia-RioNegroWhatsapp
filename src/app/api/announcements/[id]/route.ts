import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { announcementInputSchema } from "@/lib/validations";
import {
  deleteAnnouncement,
  updateAnnouncement,
} from "@/server/panel-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    const payload = await parseRequestBody(request, announcementInputSchema);
    return ok(await updateAnnouncement(id, payload));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await deleteAnnouncement(id));
  } catch (error) {
    return handleApiError(error);
  }
}
