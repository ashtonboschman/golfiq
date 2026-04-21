import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';
import { clearRateLimitStore } from '../rateLimit';

describe('API middleware auth throttling', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('applies auth-attempt rate limits to PUT /api/users/change-password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = middleware(
        new NextRequest('http://localhost/api/users/change-password', {
          method: 'PUT',
        }),
      );
      expect(response.status).toBe(200);
    }

    const blocked = middleware(
      new NextRequest('http://localhost/api/users/change-password', {
        method: 'PUT',
      }),
    );

    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.message).toBe('Too many authentication attempts. Please wait 15 minutes and try again.');
  });

  it('does not let account auth throttling block public auth routes', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = middleware(
        new NextRequest('http://localhost/api/users/change-password', {
          method: 'PUT',
        }),
      );
      expect(response.status).toBe(200);
    }

    const accountBlocked = middleware(
      new NextRequest('http://localhost/api/users/change-password', {
        method: 'PUT',
      }),
    );
    expect(accountBlocked.status).toBe(429);

    const registerResponse = middleware(
      new NextRequest('http://localhost/api/users/register', {
        method: 'POST',
      }),
    );
    expect(registerResponse.status).toBe(200);
  });

  it('does not let public auth throttling block account auth routes', () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = middleware(
        new NextRequest('http://localhost/api/users/register', {
          method: 'POST',
        }),
      );
      expect(response.status).toBe(200);
    }

    const publicBlocked = middleware(
      new NextRequest('http://localhost/api/users/register', {
        method: 'POST',
      }),
    );
    expect(publicBlocked.status).toBe(429);

    const changePasswordResponse = middleware(
      new NextRequest('http://localhost/api/users/change-password', {
        method: 'PUT',
      }),
    );
    expect(changePasswordResponse.status).toBe(200);
  });

  it('does not apply auth-attempt throttling to POST /api/auth/signout', () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = middleware(
        new NextRequest('http://localhost/api/auth/signout', {
          method: 'POST',
        }),
      );
      expect(response.status).toBe(200);
    }
  });

  it('does not apply auth-attempt throttling to POST /api/auth/callback/credentials', () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = middleware(
        new NextRequest('http://localhost/api/auth/callback/credentials', {
          method: 'POST',
        }),
      );
      expect(response.status).toBe(200);
    }
  });
});
