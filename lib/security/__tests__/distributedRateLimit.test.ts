import { prisma } from '@/lib/db';
import {
  consumeDistributedRateLimit,
  hashRateLimitIdentifier,
} from '../distributedRateLimit';

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

const mockedQueryRaw = jest.mocked(prisma.$queryRaw);

describe('distributed authentication rate limiting', () => {
  beforeEach(() => {
    mockedQueryRaw.mockReset();
  });

  it('hashes identifiers deterministically without retaining the source value', () => {
    const identifier = '203.0.113.8';
    const hashed = hashRateLimitIdentifier(identifier);

    expect(hashed).toHaveLength(64);
    expect(hashed).toBe(hashRateLimitIdentifier(identifier));
    expect(hashed).not.toContain(identifier);
  });

  it('uses one atomic upsert and allows requests within the window limit', async () => {
    mockedQueryRaw.mockResolvedValueOnce([{
      count: 3,
      reset_at: new Date('2026-08-27T15:15:00.000Z'),
    }]);

    const result = await consumeDistributedRateLimit({
      bucket: 'auth_public',
      identifier: '203.0.113.8',
      limit: 8,
      windowMs: 15 * 60 * 1000,
      nowMs: Date.parse('2026-08-27T15:00:00.000Z'),
    });

    expect(result).toEqual({
      allowed: true,
      limit: 8,
      remaining: 5,
      resetAt: Date.parse('2026-08-27T15:15:00.000Z'),
      retryAfterSec: 900,
    });

    const sql = (mockedQueryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join(' ');
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(sql).toContain('"count" + 1');

    const values = mockedQueryRaw.mock.calls[0]?.slice(1);
    expect(values).toContain(`auth_public:${hashRateLimitIdentifier('203.0.113.8')}`);
    expect(values).not.toContain('203.0.113.8');
  });

  it('blocks requests above the shared limit', async () => {
    mockedQueryRaw.mockResolvedValueOnce([{
      count: 9,
      reset_at: new Date('2026-08-27T15:01:00.000Z'),
    }]);

    const result = await consumeDistributedRateLimit({
      bucket: 'auth_public',
      identifier: '203.0.113.8',
      limit: 8,
      windowMs: 15 * 60 * 1000,
      nowMs: Date.parse('2026-08-27T15:00:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      remaining: 0,
      retryAfterSec: 60,
    }));
  });

  it('returns null so the local fallback remains available during database errors', async () => {
    mockedQueryRaw.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(consumeDistributedRateLimit({
      bucket: 'auth_account',
      identifier: '203.0.113.8',
      limit: 5,
      windowMs: 15 * 60 * 1000,
    })).resolves.toBeNull();
  });
});
