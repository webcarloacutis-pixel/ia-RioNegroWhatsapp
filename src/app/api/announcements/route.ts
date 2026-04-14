import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { announcementInputSchema } from "@/lib/validations";
import { createAnnouncement, listAnnouncements } from "@/server/panel-service";

export async function GET() {
  try {
    await assertAdminApiSession();
    return ok(await listAnnouncements());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminApiSession();
    const payload = await parseRequestBody(request, announcementInputSchema);
    return ok(await createAnnouncement(payload), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
