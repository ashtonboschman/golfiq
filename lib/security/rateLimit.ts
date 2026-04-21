type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

type GlobalWithRateLimitStore = typeof globalThis & {
  __golfiqRateLimitStore?: RateLimitStore;
  __golfiqRateLimitSweepAt?: number;
};

export type ConsumeRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

export type ConsumeRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

const SWEEP_INTERVAL_MS = 60_000;

function getRateLimitStore(): RateLimitStore {
  const globalScope = globalThis as GlobalWithRateLimitStore;
  if (!globalScope.__golfiqRateLimitStore) {
    globalScope.__golfiqRateLimitStore = new Map<string, RateLimitEntry>();
  }
  return globalScope.__golfiqRateLimitStore;
}

function maybeSweepExpired(nowMs: number): void {
  const globalScope = globalThis as GlobalWithRateLimitStore;
  const nextSweepAt = globalScope.__golfiqRateLimitSweepAt ?? 0;
  if (nowMs < nextSweepAt) {
    return;
  }

  const store = getRateLimitStore();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= nowMs) {
      store.delete(key);
    }
  }

  globalScope.__golfiqRateLimitSweepAt = nowMs + SWEEP_INTERVAL_MS;
}

export function consumeRateLimit({
  key,
  limit,
  windowMs,
  nowMs = Date.now(),
}: ConsumeRateLimitInput): ConsumeRateLimitResult {
  if (!key) {
    throw new Error('Rate limit key is required.');
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('Rate limit "limit" must be greater than zero.');
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('Rate limit "windowMs" must be greater than zero.');
  }

  maybeSweepExpired(nowMs);

  const store = getRateLimitStore();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= nowMs) {
    const resetAt = nowMs + windowMs;
    store.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSec: Math.max(0, Math.ceil((resetAt - nowMs) / 1000)),
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(0, Math.ceil((existing.resetAt - nowMs) / 1000)),
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSec: Math.max(0, Math.ceil((existing.resetAt - nowMs) / 1000)),
  };
}

type HeaderCarrier = {
  headers: {
    get(name: string): string | null;
  };
};

export function getClientIp(request: HeaderCarrier): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

export function clearRateLimitStore(): void {
  const globalScope = globalThis as GlobalWithRateLimitStore;
  globalScope.__golfiqRateLimitStore?.clear();
  globalScope.__golfiqRateLimitSweepAt = 0;
}
