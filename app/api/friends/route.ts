import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { z } from 'zod';

// GET friends list
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const friends = await prisma.friend.findMany({
      where: {
        OR: [
          { userId },
          { friendId: userId },
        ],
      },
      select: {
        userId: true,
        friendId: true,
        user: {
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
        },
        friend: {
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
        },
      },
    });

    // Map to get the other user in the friendship
    const results = friends.map((f: any) => {
      const otherUser = f.userId === userId ? f.friend : f.user;
      return {
        id: Number(otherUser.id),
        username: otherUser.username,
        first_name: otherUser.profile?.firstName,
        last_name: otherUser.profile?.lastName,
        avatar_url: otherUser.profile?.avatarUrl,
        handicap: otherUser.leaderboardStats ? Number(otherUser.leaderboardStats.handicap) : null,
        average_score: otherUser.leaderboardStats ? Number(otherUser.leaderboardStats.averageToPar) : null,
        best_score: otherUser.leaderboardStats?.bestToPar ?? null,
        total_rounds: otherUser.leaderboardStats?.totalRounds ?? null,
      };
    });

    // Sort by username
    results.sort((a, b) => a.username.localeCompare(b.username));

    return successResponse({ results });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/friends error:', error);
    return errorResponse('Database error', 500);
  }
}

// SEND friend request
const sendRequestSchema = z.object({
  recipientId: z.string().or(z.number()),
});

export async function POST(request: NextRequest) {
  try {
    const requesterId = await requireAuth(request);
    const body = await request.json();

    const result = sendRequestSchema.safeParse(body);
    if (!result.success) {
      return errorResponse('Invalid recipient', 400);
    }

    const recipientId = BigInt(result.data.recipientId);

    if (requesterId === recipientId) {
      return errorResponse('Invalid recipient', 400);
    }

    // Check if already friends
    const existingFriendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: requesterId, friendId: recipientId },
          { userId: recipientId, friendId: requesterId },
        ],
      },
    });

    if (existingFriendship) {
      return errorResponse('Already friends', 409);
    }

    // Check if request already exists
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        requesterId,
        recipientId,
      },
    });

    if (existingRequest) {
      return errorResponse('Friend request already exists', 409);
    }

    // Create friend request
    const friendRequest = await prisma.friendRequest.create({
      data: {
        requesterId,
        recipientId,
      },
    });

    // Fetch recipient details to return in response
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
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
      },
    });

    return successResponse({
      message: 'Friend request sent',
      request: {
        id: Number(friendRequest.id),
        user_id: Number(recipientId),
        username: recipient?.username,
        first_name: recipient?.profile?.firstName,
        last_name: recipient?.profile?.lastName,
        avatar_url: recipient?.profile?.avatarUrl,
        created_date: friendRequest.createdDate,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/friends error:', error);
    return errorResponse('Database error', 500);
  }
}
