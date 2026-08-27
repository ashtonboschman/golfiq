import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { ConsumeRateLimitResult } from './rateLimit';

type RateLimitRow = {
  count: number;
  reset_at: Date;
};

type ConsumeDistributedRateLimitInput = {
  bucket: string;
  identifier: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

const EXPIRED_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;

export function hashRateLimitIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex');
}

export async function consumeDistributedRateLimit({
  bucket,
  identifier,
  limit,
  windowMs,
  nowMs = Date.now(),
}: ConsumeDistributedRateLimitInput): Promise<ConsumeRateLimitResult | null> {
  if (!bucket || !identifier) {
    throw new Error('Distributed rate limit bucket and identifier are required.');
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('Distributed rate limit "limit" must be greater than zero.');
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('Distributed rate limit "windowMs" must be greater than zero.');
  }

  const now = new Date(nowMs);
  const nextResetAt = new Date(nowMs + windowMs);
  const cleanupBefore = new Date(nowMs - EXPIRED_BUCKET_RETENTION_MS);
  const key = `${bucket}:${hashRateLimitIdentifier(identifier)}`;

  try {
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      WITH expired_buckets AS (
        DELETE FROM "security_rate_limit_buckets"
        WHERE "reset_at" <= ${cleanupBefore}
      )
      INSERT INTO "security_rate_limit_buckets" ("key", "count", "reset_at", "updated_at")
      VALUES (${key}, 1, ${nextResetAt}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "security_rate_limit_buckets"."reset_at" <= ${now} THEN 1
          ELSE "security_rate_limit_buckets"."count" + 1
        END,
        "reset_at" = CASE
          WHEN "security_rate_limit_buckets"."reset_at" <= ${now} THEN ${nextResetAt}
          ELSE "security_rate_limit_buckets"."reset_at"
        END,
        "updated_at" = ${now}
      RETURNING "count", "reset_at"
    `;

    const row = rows[0];
    if (!row) return null;

    const resetAt = row.reset_at.getTime();
    return {
      allowed: row.count <= limit,
      limit,
      remaining: Math.max(0, limit - row.count),
      resetAt,
      retryAfterSec: Math.max(0, Math.ceil((resetAt - nowMs) / 1000)),
    };
  } catch {
    // Keep authentication available during a transient database outage. The
    // process-local limiter in proxy.ts remains active as defense in depth.
    return null;
  }
}
