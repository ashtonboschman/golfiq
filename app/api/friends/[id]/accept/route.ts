import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const requestId = BigInt(id);

    // Find the friend request
    const friendRequest = await prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        recipientId: userId,
      },
    });

    if (!friendRequest) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.apiRequestFailed,
        distinctId: userId.toString(),
        properties: {
          endpoint: '/api/friends/[id]/accept',
          method: 'POST',
          status_code: 404,
          failure_stage: 'lookup',
          error_code: 'friend_request_not_found',
        },
        context: { request, sourcePage: '/api/friends/[id]/accept' },
      });
      return errorResponse('Friend request not found', 404);
    }

    const requesterId = friendRequest.requesterId;

    // Create friendship (canonical order: lower ID first)
    const [userId1, userId2] =
      userId < requesterId ? [userId, requesterId] : [requesterId, userId];

    await prisma.friend.create({
      data: {
        userId: userId1,
        friendId: userId2,
      },
    });

    // Delete the friend request
    await prisma.friendRequest.delete({
      where: { id: requestId },
    });

    // Fetch the new friend's details including leaderboard stats
    const friend = await prisma.user.findUnique({
      where: { id: requesterId },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        leaderboardStats: {
          select: {
            handicap: true,
            averageToPar: true,
            bestToPar: true,
            totalRounds: true,
          },
        },
      },
    });

    const now = Date.now();
    const requestedAt = friendRequest.createdAt?.getTime?.() ?? now;
    const requestAgeDays = Math.max(0, Math.floor((now - requestedAt) / (24 * 60 * 60 * 1000)));

    await captureServerEvent({
      event: ANALYTICS_EVENTS.friendRequestAccepted,
      distinctId: userId.toString(),
      properties: {
        requester_id: requesterId.toString(),
        request_id: requestId.toString(),
        request_age_days: requestAgeDays,
      },
      context: {
        request,
        sourcePage: '/api/friends/[id]/accept',
        isLoggedIn: true,
      },
    });

    return successResponse({
      message: 'Friend request accepted',
      friend: {
        id: Number(friend!.id),
        username: friend!.username,
        first_name: friend!.profile?.firstName,
        last_name: friend!.profile?.lastName,
        avatar_url: friend!.profile?.avatarUrl,
        handicap: friend!.leaderboardStats?.handicap != null ? Number(friend!.leaderboardStats.handicap) : null,
        average_score: friend!.leaderboardStats?.averageToPar != null ? Number(friend!.leaderboardStats.averageToPar) : null,
        best_score: friend!.leaderboardStats?.bestToPar ?? null,
        total_rounds: friend!.leaderboardStats?.totalRounds ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/friends/:id/accept error:', error);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.apiRequestFailed,
      distinctId: 'anonymous',
      properties: {
        endpoint: '/api/friends/[id]/accept',
        method: 'POST',
        status_code: 500,
        failure_stage: 'exception',
        error_code: 'server_exception',
      },
      context: { request, sourcePage: '/api/friends/[id]/accept', isLoggedIn: false },
    });
    return errorResponse('Database error', 500);
  }
}
