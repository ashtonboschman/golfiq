import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const requests = await prisma.friendRequest.findMany({
      where: { requesterId: userId },
      select: {
        id: true,
        createdDate: true,
        recipient: {
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

    const results = requests.map(req => ({
      id: Number(req.id),
      created_date: req.createdDate,
      user_id: Number(req.recipient.id),
      username: req.recipient.username,
      first_name: req.recipient.profile?.firstName,
      last_name: req.recipient.profile?.lastName,
      avatar_url: req.recipient.profile?.avatarUrl,
      handicap: req.recipient.leaderboardStats ? Number(req.recipient.leaderboardStats.handicap) : null,
      average_score: req.recipient.leaderboardStats ? Number(req.recipient.leaderboardStats.averageToPar) : null,
      best_score: req.recipient.leaderboardStats?.bestToPar ?? null,
      total_rounds: req.recipient.leaderboardStats?.totalRounds ?? null,
    }));

    return successResponse({ results });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/friends/outgoing error:', error);
    return errorResponse('Database error', 500);
  }
}
