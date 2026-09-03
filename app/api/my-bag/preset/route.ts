import { NextRequest } from 'next/server';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { applyMyBagPreset, MyBagServiceError } from '@/lib/clubs/myBagService';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }

    return successResponse(await applyMyBagPreset(userId, body), 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    if (error instanceof MyBagServiceError) {
      return errorResponse(error.message, error.status);
    }
    console.error('POST /api/my-bag/preset error:', error);
    return errorResponse('Unable to set up My Bag.', 500);
  }
}
