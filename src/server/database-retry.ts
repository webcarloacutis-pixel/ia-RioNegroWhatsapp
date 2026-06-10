import { classifyPrismaError, logger, sanitizeError } from "@/lib/logger";

type DatabaseRetryOptions = {
  requestId?: string;
  retries?: number;
  delaysMs?: number[];
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRetryableDatabaseError(error: unknown) {
  const classification = classifyPrismaError(error);

  return classification.type === "DATABASE_CONNECTION_FAILED";
}

export async function withDatabaseRetry<T>(
  operationName: string,
  fn: () => Promise<T>,
  options: DatabaseRetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const delaysMs = options.delaysMs ?? [300, 800];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt === 0) {
        logger.info("database", "operation started", {
          requestId: options.requestId,
          operationName,
        });
      }

      const result = await fn();

      if (attempt > 0) {
        logger.info("database", "operation recovered after retry", {
          requestId: options.requestId,
          operationName,
          attempt,
        });
      }

      return result;
    } catch (error) {
      lastError = error;
      const classification = classifyPrismaError(error);
      const shouldRetry = isRetryableDatabaseError(error) && attempt < retries;

      logger.warn("database", shouldRetry ? "operation failed, retrying" : "operation failed", {
        requestId: options.requestId,
        operationName,
        attempt,
        nextDelayMs: shouldRetry ? delaysMs[attempt] ?? delaysMs.at(-1) : null,
        classification,
        error: sanitizeError(error),
      });

      if (!shouldRetry) {
        throw error;
      }

      await sleep(delaysMs[attempt] ?? delaysMs.at(-1) ?? 800);
    }
  }

  throw lastError;
}
