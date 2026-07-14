import { NextRequest } from 'next/server';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { addUserClub, MyBagServiceError } from '@/lib/clubs/myBagService';

function handleMyBagError(error: unknown, context: string) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }

  if (error instanceof MyBagServiceError) {
    return errorResponse(error.message, error.status);
  }

  console.error(`${context} error:`, error);
  return errorResponse('Unable to update My Bag.', 500);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }

    const result = await addUserClub(userId, body);
    return successResponse(result, 201);
  } catch (error) {
    return handleMyBagError(error, 'POST /api/my-bag/clubs');
  }
}
