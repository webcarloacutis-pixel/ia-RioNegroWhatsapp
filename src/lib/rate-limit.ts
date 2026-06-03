type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as unknown as {
  __rionegroRateLimitStore?: Map<string, RateLimitEntry>;
};

function getStore() {
  if (!globalForRateLimit.__rionegroRateLimitStore) {
    globalForRateLimit.__rionegroRateLimitStore = new Map();
  }

  return globalForRateLimit.__rionegroRateLimitStore;
}

function isRateLimitEnabled() {
  return process.env.RATE_LIMIT_ENABLED !== "false";
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp || cfIp || "unknown";

  return candidate.replace(/[^\w:.-]/g, "").slice(0, 80) || "unknown";
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  now = Date.now(),
) {
  if (!isRateLimitEnabled()) {
    return {
      allowed: true,
      remaining: options.limit,
      resetAt: now + options.windowMs,
      retryAfterMs: 0,
    };
  }

  const store = getStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + options.windowMs;
    store.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      resetAt,
      retryAfterMs: 0,
    };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  current.count += 1;

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - current.count),
    resetAt: current.resetAt,
    retryAfterMs: 0,
  };
}

export function resetRateLimit(key?: string) {
  const store = getStore();

  if (key) {
    store.delete(key);
    return;
  }

  store.clear();
}
