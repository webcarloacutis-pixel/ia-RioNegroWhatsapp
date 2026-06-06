"use client";

type ClientLogLevel = "debug" | "info" | "warn" | "error";

const sensitiveKeyPattern = /(token|secret|password|api[_-]?key|authorization|cookie|session)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[MAX_DEPTH]";

  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitize(item, depth + 1));
  }

  if (typeof value === "object" && value) {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitize(item, depth + 1);
    }

    return output;
  }

  return value;
}

function write(level: ClientLogLevel, module: string, message: string, meta?: unknown) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    meta: meta ? sanitize(meta) : undefined,
  };
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  method(`[client:${module}] ${message}`, payload);
}

export const clientLogger = {
  debug: (module: string, message: string, meta?: unknown) => write("debug", module, message, meta),
  info: (module: string, message: string, meta?: unknown) => write("info", module, message, meta),
  warn: (module: string, message: string, meta?: unknown) => write("warn", module, message, meta),
  error: (module: string, message: string, meta?: unknown) => write("error", module, message, meta),
};
