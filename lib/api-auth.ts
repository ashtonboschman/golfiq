import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

/**
 * Get authenticated user from session
 * Returns user ID as BigInt or null if not authenticated
 */
export async function getAuthUser(req?: NextRequest): Promise<bigint | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return BigInt(session.user.id);
}

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth(req?: NextRequest): Promise<bigint> {
  const userId = await getAuthUser(req);

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}

/**
 * API Response helpers
 */
const API_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
} as const;

export function successResponse<T>(data: T, status = 200) {
  return Response.json(
    { ...data, type: 'success' },
    { status, headers: API_NO_STORE_HEADERS }
  );
}

export function errorResponse(message: string, status = 400) {
  return Response.json(
    { message, type: 'error' },
    { status, headers: API_NO_STORE_HEADERS }
  );
}

/**
 * Serialize BigInt values to strings for JSON responses
 */
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}
