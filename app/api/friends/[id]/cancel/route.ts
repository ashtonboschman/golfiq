import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const requestId = BigInt(id);

    const result = await prisma.friendRequest.deleteMany({
      where: {
        id: requestId,
        requesterId: userId,
      },
    });

    if (result.count === 0) {
      return errorResponse('Friend request not found', 404);
    }

    return successResponse({ message: 'Outgoing friend request cancelled' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/friends/:id/cancel error:', error);
    return errorResponse('Database error', 500);
  }
}
