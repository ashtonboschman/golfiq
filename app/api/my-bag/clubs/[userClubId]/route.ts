import { NextRequest } from 'next/server';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import {
  MyBagServiceError,
  removeUserClub,
  updateUserClub,
} from '@/lib/clubs/myBagService';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userClubId: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { userClubId } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }

    const result = await updateUserClub(userId, userClubId, body);
    return successResponse(result);
  } catch (error) {
    return handleMyBagError(error, 'PATCH /api/my-bag/clubs/[userClubId]');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userClubId: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { userClubId } = await params;
    const result = await removeUserClub(userId, userClubId);
    return successResponse(result);
  } catch (error) {
    return handleMyBagError(error, 'DELETE /api/my-bag/clubs/[userClubId]');
  }
}
