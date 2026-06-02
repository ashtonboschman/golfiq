import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { isAdminUserId } from '@/lib/admin';

export async function requireAdmin(request?: NextRequest): Promise<bigint> {
  const userId = await requireAuth(request);

  if (!isAdminUserId(userId)) {
    throw new Error('Forbidden');
  }

  return userId;
}
