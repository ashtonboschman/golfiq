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

    // Find the friend request
    const friendRequest = await prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        recipientId: userId,
      },
    });

    if (!friendRequest) {
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

    return successResponse({
      message: 'Friend request accepted',
      friend: {
        id: Number(friend!.id),
        username: friend!.username,
        first_name: friend!.profile?.firstName,
        last_name: friend!.profile?.lastName,
        avatar_url: friend!.profile?.avatarUrl,
        handicap: friend!.leaderboardStats ? Number(friend!.leaderboardStats.handicap) : null,
        average_score: friend!.leaderboardStats ? Number(friend!.leaderboardStats.averageToPar) : null,
        best_score: friend!.leaderboardStats?.bestToPar ?? null,
        total_rounds: friend!.leaderboardStats?.totalRounds ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/friends/:id/accept error:', error);
    return errorResponse('Database error', 500);
  }
}
