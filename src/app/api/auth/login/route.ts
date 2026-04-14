import { createAdminSession, validateAdminCredentials } from "@/lib/auth";
import { handleApiError, ok, parseRequestBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, loginSchema);

    if (!validateAdminCredentials(payload.email, payload.password)) {
      throw new AppError("Credenciales invalidas.", 401);
    }

    await createAdminSession();

    return ok({
      authenticated: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
