import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

// DELETE friend (remove friendship)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const friendId = BigInt(id);

    // Canonical order for deletion
    const [userId1, userId2] = userId < friendId ? [userId, friendId] : [friendId, userId];

    const result = await prisma.friend.deleteMany({
      where: {
        userId: userId1,
        friendId: userId2,
      },
    });

    if (result.count === 0) {
      return errorResponse('Friend not found', 404);
    }

    return successResponse({ message: 'Friend removed' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('DELETE /api/friends/:id error:', error);
    return errorResponse('Database error', 500);
  }
}
