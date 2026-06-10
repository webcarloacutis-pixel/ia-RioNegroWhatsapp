import { randomUUID, createHash } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type SafeError = {
  name: string;
  message: string;
  code: string | null;
  type: string;
  stack?: string;
};

export type PrismaErrorClassification = {
  code: string | null;
  type:
    | "DATABASE_CONNECTION_FAILED"
    | "TABLE_NOT_FOUND"
    | "COLUMN_NOT_FOUND"
    | "UNIQUE_CONSTRAINT"
    | "FOREIGN_KEY_CONSTRAINT"
    | "RECORD_NOT_FOUND"
    | "ENV_MISSING"
    | "PRISMA_ERROR"
    | "UNKNOWN";
  model: string | null;
  message: string;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  requestId?: string;
  environment: string;
  meta?: unknown;
};

const levelWeights: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const sensitiveKeyPattern =
  /(token|secret|password|passphrase|api[_-]?key|authorization|cookie|session|credential|database_url|direct_url|cron_secret|admin_password)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(\+?\d[\d\s().-]{7,}\d)/g;
const messageKeyPattern = /(message|prompt|conversation|body|content|reply|description|caption)/i;
const safeIdentifierKeyPattern = /(requestId|^id$|Id$|At$|timestamp|date|time|durationMs|responseMs)/i;
const phoneKeyPattern = /(phone|whatsapp|recipient|to|from|reporter)/i;

const globalForLogger = globalThis as unknown as {
  __rionegroSafeLogs?: LogEntry[];
};

function getRecentLogsBuffer() {
  if (!globalForLogger.__rionegroSafeLogs) {
    globalForLogger.__rionegroSafeLogs = [];
  }

  return globalForLogger.__rionegroSafeLogs;
}

function getConfiguredLevel() {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();

  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }

  return "info";
}

function shouldLog(level: LogLevel) {
  if (level === "debug" && process.env.NODE_ENV === "production" && process.env.LOG_DEBUG !== "true") {
    return false;
  }

  if (process.env.LOG_DEBUG === "true") {
    return true;
  }

  return levelWeights[level] >= levelWeights[getConfiguredLevel()];
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function createRequestId() {
  return randomUUID();
}

export function maskSecret(value?: string | null) {
  return value ? "[REDACTED]" : "";
}

export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length <= 4) {
    return "****";
  }

  const lastFour = digits.slice(-4);

  if (digits.startsWith("57")) {
    return `+57******${lastFour}`;
  }

  return `******${lastFour}`;
}

export function maskEmail(value: string) {
  const [localPart = "", domain = ""] = value.trim().split("@");

  if (!localPart || !domain) {
    return "invalid-email";
  }

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}***`
      : `${localPart[0]}***${localPart.slice(-1)}`;

  return `${maskedLocal}@${domain}`;
}

function sanitizeDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname
      ? `${url.hostname.slice(0, 3)}***${url.hostname.slice(-4)}`
      : "unknown";

    return `${url.protocol.replace(":", "")}://${host}`;
  } catch {
    return "[REDACTED_DATABASE_URL]";
  }
}

function sanitizeString(value: string, key?: string) {
  if (key && sensitiveKeyPattern.test(key)) {
    return /database_url|direct_url/i.test(key) ? sanitizeDatabaseUrl(value) : maskSecret(value);
  }

  if (key && safeIdentifierKeyPattern.test(key)) {
    return value;
  }

  const shouldMaskPhone = value.trim().startsWith("+") || Boolean(key && phoneKeyPattern.test(key));

  let sanitized = value.replace(emailPattern, (match) => maskEmail(match));

  if (shouldMaskPhone) {
    sanitized = sanitized.replace(phonePattern, (match) => maskPhone(match));
  }

  if (key && messageKeyPattern.test(key)) {
    if (process.env.NODE_ENV === "production") {
      return {
        preview: sanitized.slice(0, 40),
        sha256: hashText(value),
        length: value.length,
      };
    }

    sanitized = sanitized.length > 180 ? `${sanitized.slice(0, 180)}...` : sanitized;
  }

  return sanitized;
}

function sanitizeValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > 5) {
    return "[MAX_DEPTH]";
  }

  if (typeof value === "string") {
    return sanitizeString(value, key);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, key, depth + 1));
  }

  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value === "object" && value) {
    const output: Record<string, unknown> = {};

    for (const [entryKey, entryValue] of Object.entries(value)) {
      const sanitized = sanitizeValue(entryValue, entryKey, depth + 1);

      if (typeof sanitized !== "undefined") {
        output[entryKey] = sanitized;
      }
    }

    return output;
  }

  return value;
}

export function sanitizeLogPayload(payload: unknown) {
  return sanitizeValue(payload);
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

function getErrorModel(error: unknown) {
  if (error && typeof error === "object" && "meta" in error) {
    const meta = (error as { meta?: unknown }).meta;

    if (meta && typeof meta === "object" && "modelName" in meta) {
      const modelName = (meta as { modelName?: unknown }).modelName;
      return typeof modelName === "string" ? modelName : null;
    }

    if (meta && typeof meta === "object" && "model" in meta) {
      const model = (meta as { model?: unknown }).model;
      return typeof model === "string" ? model : null;
    }
  }

  return null;
}

export function classifyPrismaError(error: unknown): PrismaErrorClassification {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
  const model = getErrorModel(error);

  if (code === "P1001" || /can't reach database|server has closed|timed out/i.test(message)) {
    return {
      code,
      type: "DATABASE_CONNECTION_FAILED",
      model,
      message: "Database connection failed or timed out.",
    };
  }

  if (code === "P2021" || /table.*does not exist|relation .* does not exist/i.test(message)) {
    return {
      code: code ?? "P2021",
      type: "TABLE_NOT_FOUND",
      model,
      message: "Table does not exist or migration was not applied.",
    };
  }

  if (code === "P2022" || /column.*does not exist/i.test(message)) {
    return {
      code: code ?? "P2022",
      type: "COLUMN_NOT_FOUND",
      model,
      message: "Column does not exist or schema is out of date.",
    };
  }

  if (code === "P2002") {
    return { code, type: "UNIQUE_CONSTRAINT", model, message: "Unique constraint failed." };
  }

  if (code === "P2003") {
    return { code, type: "FOREIGN_KEY_CONSTRAINT", model, message: "Foreign key constraint failed." };
  }

  if (code === "P2025") {
    return { code, type: "RECORD_NOT_FOUND", model, message: "Record not found." };
  }

  if (/environment variable not found/i.test(message)) {
    return { code, type: "ENV_MISSING", model, message: "Required environment variable is missing." };
  }

  if (/prisma/i.test(message) || code) {
    return { code, type: "PRISMA_ERROR", model, message: "Prisma error." };
  }

  return { code, type: "UNKNOWN", model, message: "Unknown error." };
}

export function sanitizeError(error: unknown): SafeError {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
  const classification = classifyPrismaError(error);
  const safeMessage = sanitizeString(message, "error");
  const safeError: SafeError = {
    name,
    message: typeof safeMessage === "string" ? safeMessage : safeMessage.preview,
    code: classification.code,
    type: classification.type,
  };

  if (process.env.LOG_DEBUG === "true" && process.env.NODE_ENV !== "production" && error instanceof Error) {
    const safeStack = sanitizeString(error.stack ?? "", "stack");
    safeError.stack = typeof safeStack === "string" ? safeStack : safeStack.preview;
  }

  return safeError;
}

function writeLog(entry: LogEntry) {
  const output = Object.fromEntries(
    Object.entries({
      ...entry,
      meta: entry.meta ? sanitizeLogPayload(entry.meta) : undefined,
    }).filter(([, value]) => typeof value !== "undefined"),
  ) as LogEntry;
  const buffer = getRecentLogsBuffer();
  buffer.push(output);

  if (buffer.length > 120) {
    buffer.splice(0, buffer.length - 120);
  }

  const consoleMethod =
    entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.log;

  consoleMethod(`[${entry.module}] ${entry.message}`, output);
}

function log(level: LogLevel, module: string, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;

  const requestId =
    meta && typeof meta === "object" && "requestId" in meta
      ? (meta as { requestId?: unknown }).requestId
      : undefined;

  writeLog({
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    requestId: typeof requestId === "string" && requestId ? requestId : undefined,
    environment: process.env.NODE_ENV ?? "development",
    meta,
  });
}

export const logger = {
  debug: (module: string, message: string, meta?: unknown) => log("debug", module, message, meta),
  info: (module: string, message: string, meta?: unknown) => log("info", module, message, meta),
  warn: (module: string, message: string, meta?: unknown) => log("warn", module, message, meta),
  error: (module: string, message: string, meta?: unknown) => log("error", module, message, meta),
};

export function getRecentSafeLogs(limit = 30) {
  return getRecentLogsBuffer().slice(-limit);
}
