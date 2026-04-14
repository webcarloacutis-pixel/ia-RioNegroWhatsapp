export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getErrorMessage(error: unknown, fallback = "Ha ocurrido un error.") {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
