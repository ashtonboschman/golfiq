import { NextRequest } from 'next/server';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { getMyBag, MyBagServiceError } from '@/lib/clubs/myBagService';

function handleMyBagError(error: unknown, context: string) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }

  if (error instanceof MyBagServiceError) {
    return errorResponse(error.message, error.status);
  }

  console.error(`${context} error:`, error);
  return errorResponse('Unable to load My Bag.', 500);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const mode = new URL(request.url).searchParams.get('mode');
    const result = await getMyBag(userId, {
      includeCatalogue: mode !== 'clubs',
    });
    return successResponse(result);
  } catch (error) {
    return handleMyBagError(error, 'GET /api/my-bag');
  }
}
