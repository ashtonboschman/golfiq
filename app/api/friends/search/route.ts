import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
      return errorResponse('Query required', 400);
    }

    const searchTerm = `%${query}%`;

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

    // Check friendship/request status for each user
    const results = await Promise.all(
      users.map(async (user: any) => {
        // Check if friends
        const friendship = await prisma.friend.findFirst({
          where: {
            OR: [
              { userId, friendId: user.id },
              { userId: user.id, friendId: userId },
            ],
          },
        });

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

        if (friendship) {
          return {
            ...baseUser,
            status: 'friend',
            outgoing_request_id: null,
            incoming_request_id: null,
          };
        }

        // Check for outgoing request
        const outgoingRequest = await prisma.friendRequest.findFirst({
          where: {
            requesterId: userId,
            recipientId: user.id,
          },
        });

        if (outgoingRequest) {
          return {
            ...baseUser,
            status: 'outgoing',
            outgoing_request_id: Number(outgoingRequest.id),
            incoming_request_id: null,
          };
        }

        // Check for incoming request
        const incomingRequest = await prisma.friendRequest.findFirst({
          where: {
            requesterId: user.id,
            recipientId: userId,
          },
        });

        if (incomingRequest) {
          return {
            ...baseUser,
            status: 'incoming',
            outgoing_request_id: null,
            incoming_request_id: Number(incomingRequest.id),
          };
        }

        return {
          ...baseUser,
          status: 'none',
          outgoing_request_id: null,
          incoming_request_id: null,
        };
      })
    );

    return successResponse({ results });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/friends/search error:', error);
    return errorResponse('Database error', 500);
  }
}
