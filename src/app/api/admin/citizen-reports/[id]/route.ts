import { z } from "zod";

import { assertAdminApiSession } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import type { CitizenReportStatus } from "@/lib/types";
import {
  getCitizenReportById,
  updateCitizenReport,
} from "@/server/citizen-report-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const updateCitizenReportSchema = z.object({
  status: z
    .enum([
      "pending",
      "reviewing",
      "approved",
      "rejected",
      "converted_to_mass_message",
      "attended",
      "resolved",
    ])
    .optional(),
  adminNotes: z.string().trim().max(1200).optional().nullable(),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    return ok(await getCitizenReportById(id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertAdminApiSession();
    const { id } = await context.params;
    const payload = await parseRequestBody(request, updateCitizenReportSchema);
    return ok(
      await updateCitizenReport(id, {
        status: payload.status as CitizenReportStatus | undefined,
        adminNotes: payload.adminNotes,
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
