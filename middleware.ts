import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit, getClientIp } from '@/lib/security/rateLimit';

const GLOBAL_API_WINDOW_MS = Number(process.env.RATE_LIMIT_API_WINDOW_MS ?? 15 * 60 * 1000);
const GLOBAL_API_MAX = Number(process.env.RATE_LIMIT_API_MAX ?? 300);

const AUTH_PUBLIC_WINDOW_MS = Number(process.env.RATE_LIMIT_AUTH_PUBLIC_WINDOW_MS ?? 15 * 60 * 1000);
const AUTH_PUBLIC_MAX = Number(process.env.RATE_LIMIT_AUTH_PUBLIC_MAX ?? 8);
const AUTH_ACCOUNT_WINDOW_MS = Number(process.env.RATE_LIMIT_AUTH_ACCOUNT_WINDOW_MS ?? 15 * 60 * 1000);
const AUTH_ACCOUNT_MAX = Number(process.env.RATE_LIMIT_AUTH_ACCOUNT_MAX ?? 5);
const MAX_API_BODY_BYTES = Number(process.env.MAX_API_BODY_BYTES ?? 256 * 1024);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function getClientIdentifier(request: NextRequest): string {
  const ip = getClientIp(request);
  if (ip) return ip;

  const userAgent = request.headers.get('user-agent')?.trim();
  if (userAgent) return `ua:${userAgent}`;

  return 'unknown-client';
}

function withRateLimitHeaders(response: NextResponse, params: {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(params.limit));
  response.headers.set('X-RateLimit-Remaining', String(Math.max(0, params.remaining)));
  response.headers.set('X-RateLimit-Reset', String(Math.max(0, Math.ceil(params.resetAt / 1000))));
  if (params.retryAfterSec > 0) {
    response.headers.set('Retry-After', String(params.retryAfterSec));
  }
  return response;
}

type AuthThrottleBucket = 'auth_public' | 'auth_account' | null;

function getAuthThrottleBucket(request: NextRequest): AuthThrottleBucket {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname === '/api/users/change-password' && method === 'PUT') {
    return 'auth_account';
  }

  if (method !== 'POST') return null;

  if (pathname === '/api/users/register') return 'auth_public';
  if (pathname === '/api/auth/forgot-password') return 'auth_public';
  if (pathname === '/api/auth/reset-password') return 'auth_public';
  if (pathname === '/api/auth/verify-email') return 'auth_public';
  if (pathname === '/api/auth/resend-verification') return 'auth_public';

  return null;
}

function shouldSkipGlobalLimit(pathname: string): boolean {
  if (pathname.startsWith('/api/webhooks/')) return true;
  if (pathname.startsWith('/api/uploadthing')) return true;
  return false;
}

function validateMutationBody(request: NextRequest): NextResponse | null {
  if (!BODY_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const contentLengthHeader = request.headers.get('content-length');
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  const pathname = request.nextUrl.pathname;

  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return NextResponse.json(
        {
          type: 'error',
          message: 'Invalid Content-Length header.',
        },
        { status: 400 },
      );
    }

    if (contentLength > MAX_API_BODY_BYTES) {
      return NextResponse.json(
        {
          type: 'error',
          message: 'Request payload is too large.',
        },
        { status: 413 },
      );
    }
  }

  const hasBody = contentLengthHeader ? Number(contentLengthHeader) > 0 : false;
  const expectsJson = shouldRequireJsonContentType(pathname, request.method.toUpperCase());
  if (expectsJson && hasBody && !contentType.includes('application/json')) {
    return NextResponse.json(
      {
        type: 'error',
        message: 'Unsupported content type. Use application/json.',
      },
      { status: 415 },
    );
  }

  return null;
}

function shouldRequireJsonContentType(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'PUT' && pathname === '/api/users/profile') return true;
  if (normalizedMethod === 'PUT' && pathname === '/api/users/change-password') return true;
  if (normalizedMethod === 'PUT' && /^\/api\/rounds\/[^/]+$/.test(pathname)) return true;
  if (normalizedMethod === 'PUT' && pathname === '/api/theme') return true;

  if (normalizedMethod === 'PATCH' && pathname === '/api/admin/feedback') return true;

  if (normalizedMethod === 'POST' && pathname === '/api/users/register') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/friends') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/rounds') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/courses') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/feedback') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/auth/forgot-password') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/auth/reset-password') return true;
  if (normalizedMethod === 'POST' && pathname === '/api/auth/verify-email') return true;

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (shouldSkipGlobalLimit(pathname)) {
    return NextResponse.next();
  }

  const bodyValidationFailure = validateMutationBody(request);
  if (bodyValidationFailure) {
    return bodyValidationFailure;
  }

  const clientIdentifier = getClientIdentifier(request);
  const globalResult = consumeRateLimit({
    key: `api:${clientIdentifier}`,
    limit: GLOBAL_API_MAX,
    windowMs: GLOBAL_API_WINDOW_MS,
  });

  if (!globalResult.allowed) {
    const response = NextResponse.json(
      {
        type: 'error',
        message: 'Too many requests. Please try again in a few minutes.',
      },
      { status: 429 },
    );

    return withRateLimitHeaders(response, globalResult);
  }

  const authBucket = getAuthThrottleBucket(request);
  if (authBucket) {
    const authLimit = authBucket === 'auth_public' ? AUTH_PUBLIC_MAX : AUTH_ACCOUNT_MAX;
    const authWindow = authBucket === 'auth_public' ? AUTH_PUBLIC_WINDOW_MS : AUTH_ACCOUNT_WINDOW_MS;
    const authResult = consumeRateLimit({
      key: `${authBucket}:${clientIdentifier}`,
      limit: authLimit,
      windowMs: authWindow,
    });

    if (!authResult.allowed) {
      const response = NextResponse.json(
        {
          type: 'error',
          message: 'Too many authentication attempts. Please wait 15 minutes and try again.',
        },
        { status: 429 },
      );

      return withRateLimitHeaders(response, authResult);
    }
  }

  const response = NextResponse.next();
  return withRateLimitHeaders(response, globalResult);
}

export const config = {
  matcher: ['/api/:path*'],
};
