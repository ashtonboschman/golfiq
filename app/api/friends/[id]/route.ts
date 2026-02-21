import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';

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
      await captureServerEvent({
        event: ANALYTICS_EVENTS.apiRequestFailed,
        distinctId: userId.toString(),
        properties: {
          endpoint: '/api/friends/[id]',
          method: 'DELETE',
          status_code: 404,
          failure_stage: 'lookup',
          error_code: 'friend_not_found',
        },
        context: { request, sourcePage: '/api/friends/[id]' },
      });
      return errorResponse('Friend not found', 404);
    }

    await captureServerEvent({
      event: ANALYTICS_EVENTS.friendRemoved,
      distinctId: userId.toString(),
      properties: {
        friend_id: friendId.toString(),
      },
      context: {
        request,
        sourcePage: '/api/friends/[id]',
        isLoggedIn: true,
      },
    });

    return successResponse({ message: 'Friend removed' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('DELETE /api/friends/:id error:', error);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.apiRequestFailed,
      distinctId: 'anonymous',
      properties: {
        endpoint: '/api/friends/[id]',
        method: 'DELETE',
        status_code: 500,
        failure_stage: 'exception',
        error_code: 'server_exception',
      },
      context: { request, sourcePage: '/api/friends/[id]', isLoggedIn: false },
    });
    return errorResponse('Database error', 500);
  }
}
