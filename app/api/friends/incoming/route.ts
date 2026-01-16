import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const requests = await prisma.friendRequest.findMany({
      where: { recipientId: userId },
      select: {
        id: true,
        createdDate: true,
        requester: {
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
      orderBy: { createdDate: 'desc' },
    });

    const results = requests.map((req: any) => ({
      id: Number(req.id),
      created_date: req.createdDate,
      user_id: Number(req.requester.id),
      username: req.requester.username,
      first_name: req.requester.profile?.firstName,
      last_name: req.requester.profile?.lastName,
      avatar_url: req.requester.profile?.avatarUrl,
      handicap: req.requester.leaderboardStats ? Number(req.requester.leaderboardStats.handicap) : null,
      average_score: req.requester.leaderboardStats ? Number(req.requester.leaderboardStats.averageToPar) : null,
      best_score: req.requester.leaderboardStats?.bestToPar ?? null,
      total_rounds: req.requester.leaderboardStats?.totalRounds ?? null,
    }));

    return successResponse({ results });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/friends/incoming error:', error);
    return errorResponse('Database error', 500);
  }
}
