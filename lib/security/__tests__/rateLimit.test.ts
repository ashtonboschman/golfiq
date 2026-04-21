import { clearRateLimitStore, consumeRateLimit, getClientIp } from '../rateLimit';

describe('rateLimit utility', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('allows requests up to the limit and blocks the next request', () => {
    const first = consumeRateLimit({
      key: 'test:client-1',
      limit: 2,
      windowMs: 60_000,
      nowMs: 1_000,
    });
    const second = consumeRateLimit({
      key: 'test:client-1',
      limit: 2,
      windowMs: 60_000,
      nowMs: 1_500,
    });
    const third = consumeRateLimit({
      key: 'test:client-1',
      limit: 2,
      windowMs: 60_000,
      nowMs: 2_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  it('resets the bucket after the window passes', () => {
    const first = consumeRateLimit({
      key: 'test:client-2',
      limit: 1,
      windowMs: 1_000,
      nowMs: 10_000,
    });
    const blocked = consumeRateLimit({
      key: 'test:client-2',
      limit: 1,
      windowMs: 1_000,
      nowMs: 10_500,
    });
    const afterWindow = consumeRateLimit({
      key: 'test:client-2',
      limit: 1,
      windowMs: 1_000,
      nowMs: 11_100,
    });

    expect(first.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(0);
  });

  it('tracks limits independently per key', () => {
    const keyA = consumeRateLimit({
      key: 'test:client-a',
      limit: 1,
      windowMs: 60_000,
      nowMs: 5_000,
    });
    const keyABlocked = consumeRateLimit({
      key: 'test:client-a',
      limit: 1,
      windowMs: 60_000,
      nowMs: 5_500,
    });
    const keyB = consumeRateLimit({
      key: 'test:client-b',
      limit: 1,
      windowMs: 60_000,
      nowMs: 5_500,
    });

    expect(keyA.allowed).toBe(true);
    expect(keyABlocked.allowed).toBe(false);
    expect(keyB.allowed).toBe(true);
  });

  it('extracts the first forwarded IP address when present', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10, 70.41.3.18',
      'x-real-ip': '203.0.113.11',
    });

    expect(getClientIp({ headers })).toBe('203.0.113.10');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    const headers = new Headers({
      'x-real-ip': '198.51.100.2',
    });

    expect(getClientIp({ headers })).toBe('198.51.100.2');
  });

  it('returns null when no proxy IP headers are present', () => {
    const headers = new Headers();
    expect(getClientIp({ headers })).toBeNull();
  });
});
