import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim().slice(0, 100);

    if (!query) {
      return errorResponse('Query required', 400);
    }

    // Search for users matching the query
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [
              { profile: { firstName: { contains: query, mode: 'insensitive' } } },
              { profile: { lastName: { contains: query, mode: 'insensitive' } } },
            ],
          },
          {
            NOT: {
              OR: [
                {
                  blocksInitiated: {
                    some: {
                      blockedUserId: userId,
                    },
                  },
                },
                {
                  blocksReceived: {
                    some: {
                      blockerId: userId,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
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
      take: 50,
    });

    const candidateIds = users.map((user) => user.id);
    if (candidateIds.length === 0) {
      return successResponse({ results: [] });
    }

    const [friendships, requests] = await Promise.all([
      prisma.friend.findMany({
        where: {
          OR: [
            { userId, friendId: { in: candidateIds } },
            { userId: { in: candidateIds }, friendId: userId },
          ],
        },
        select: { userId: true, friendId: true },
      }),
      prisma.friendRequest.findMany({
        where: {
          OR: [
            { requesterId: userId, recipientId: { in: candidateIds } },
            { requesterId: { in: candidateIds }, recipientId: userId },
          ],
        },
        select: { id: true, requesterId: true, recipientId: true },
      }),
    ]);
    const friendIds = new Set(friendships.map((friend) =>
      friend.userId === userId ? friend.friendId : friend.userId
    ));
    const outgoingByUserId = new Map(requests
      .filter((friendRequest) => friendRequest.requesterId === userId)
      .map((friendRequest) => [friendRequest.recipientId, friendRequest.id]));
    const incomingByUserId = new Map(requests
      .filter((friendRequest) => friendRequest.recipientId === userId)
      .map((friendRequest) => [friendRequest.requesterId, friendRequest.id]));

    const results = users.map((user) => {
      const baseUser = {
        id: Number(user.id),
        first_name: user.profile?.firstName,
        last_name: user.profile?.lastName,
        avatar_url: user.profile?.avatarUrl,
        handicap: user.leaderboardStats ? Number(user.leaderboardStats.handicap) : null,
        average_score: user.leaderboardStats ? Number(user.leaderboardStats.averageToPar) : null,
        best_score: user.leaderboardStats?.bestToPar ?? null,
        total_rounds: user.leaderboardStats?.totalRounds ?? null,
      };

      if (friendIds.has(user.id)) {
        return {
          ...baseUser,
          status: 'friend',
          outgoing_request_id: null,
          incoming_request_id: null,
        };
      }

      const outgoingRequestId = outgoingByUserId.get(user.id);
      if (outgoingRequestId !== undefined) {
        return {
          ...baseUser,
          status: 'outgoing',
          outgoing_request_id: Number(outgoingRequestId),
          incoming_request_id: null,
        };
      }

      const incomingRequestId = incomingByUserId.get(user.id);
      if (incomingRequestId !== undefined) {
        return {
          ...baseUser,
          status: 'incoming',
          outgoing_request_id: null,
          incoming_request_id: Number(incomingRequestId),
        };
      }

      return {
        ...baseUser,
        status: 'none',
        outgoing_request_id: null,
        incoming_request_id: null,
      };
    });

    return successResponse({ results });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/friends/search error:', error);
    return errorResponse('Database error', 500);
  }
}
