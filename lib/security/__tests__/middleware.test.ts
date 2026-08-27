import { NextRequest } from 'next/server';
import { proxy } from '../../../proxy';
import { clearRateLimitStore } from '../rateLimit';
import { consumeDistributedRateLimit } from '../distributedRateLimit';

jest.mock('../distributedRateLimit', () => ({
  consumeDistributedRateLimit: jest.fn(),
}));

const mockedConsumeDistributedRateLimit = jest.mocked(consumeDistributedRateLimit);

describe('API middleware auth throttling', () => {
  beforeEach(() => {
    clearRateLimitStore();
    mockedConsumeDistributedRateLimit.mockReset();
    mockedConsumeDistributedRateLimit.mockResolvedValue(null);
  });

  it('applies auth-attempt rate limits to PUT /api/users/change-password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await proxy(
        new NextRequest('http://localhost/api/users/change-password', {
          method: 'PUT',
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Retry-After')).toBeNull();
    }

    const blocked = await proxy(
      new NextRequest('http://localhost/api/users/change-password', {
        method: 'PUT',
      }),
    );

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    const body = await blocked.json();
    expect(body.message).toBe('Too many authentication attempts. Please wait 15 minutes and try again.');
  });

  it('does not let account auth throttling block public auth routes', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await proxy(
        new NextRequest('http://localhost/api/users/change-password', {
          method: 'PUT',
        }),
      );
      expect(response.status).toBe(200);
    }

    const accountBlocked = await proxy(
      new NextRequest('http://localhost/api/users/change-password', {
        method: 'PUT',
      }),
    );
    expect(accountBlocked.status).toBe(429);

    const registerResponse = await proxy(
      new NextRequest('http://localhost/api/users/register', {
        method: 'POST',
      }),
    );
    expect(registerResponse.status).toBe(200);
  });

  it('does not let public auth throttling block account auth routes', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await proxy(
        new NextRequest('http://localhost/api/users/register', {
          method: 'POST',
        }),
      );
      expect(response.status).toBe(200);
    }

    const publicBlocked = await proxy(
      new NextRequest('http://localhost/api/users/register', {
        method: 'POST',
      }),
    );
    expect(publicBlocked.status).toBe(429);

    const changePasswordResponse = await proxy(
      new NextRequest('http://localhost/api/users/change-password', {
        method: 'PUT',
      }),
    );
    expect(changePasswordResponse.status).toBe(200);
  });

  it('does not apply auth-attempt throttling to POST /api/auth/signout', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await proxy(
        new NextRequest('http://localhost/api/auth/signout', {
          method: 'POST',
        }),
      );
      expect(response.status).toBe(200);
    }
  });

  it('applies an isolated auth-attempt limit to password sign-in', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await proxy(
        new NextRequest('http://localhost/api/auth/callback/credentials', {
          method: 'POST',
        }),
      );
      expect(response.status).toBe(200);
    }

    const blocked = await proxy(
      new NextRequest('http://localhost/api/auth/callback/credentials', {
        method: 'POST',
      }),
    );

    expect(blocked.status).toBe(429);
  });

  it('enforces a denial returned by the shared limiter', async () => {
    mockedConsumeDistributedRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 8,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      retryAfterSec: 60,
    });

    const response = await proxy(
      new NextRequest('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.8' },
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockedConsumeDistributedRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'auth_public',
      identifier: '203.0.113.8',
    }));
  });
});
