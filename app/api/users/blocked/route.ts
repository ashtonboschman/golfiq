import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const blockedUsers = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        blockedUserId: true,
        createdAt: true,
        blockedUser: {
          select: {
            profile: {
              select: {
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return successResponse({
      users: blockedUsers.map((entry) => ({
        id: entry.blockedUserId.toString(),
        first_name: entry.blockedUser.profile?.firstName ?? '',
        last_name: entry.blockedUser.profile?.lastName ?? '',
        avatar_url: entry.blockedUser.profile?.avatarUrl ?? '/avatars/default.png',
        blocked_at: entry.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/users/blocked error:', error);
    return errorResponse('Unable to load blocked users right now.', 500);
  }
}
