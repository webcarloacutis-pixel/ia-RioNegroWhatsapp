import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { convertCitizenReportToMassMessage } from "@/server/citizen-report-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await convertCitizenReportToMassMessage(id), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
