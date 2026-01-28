import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { isPremiumUser } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);

    const scope = searchParams.get('scope') || 'global';
    const limit = parseInt(searchParams.get('limit') || '25');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    type WhereClause = {
      totalRounds: { gt: number };
      userId?: { in: bigint[] } | bigint;
    };

    const whereClause: WhereClause = {
      totalRounds: { gt: 0 },
    };

    // Friends scope
    if (scope === 'friends') {
      const friendships = await prisma.friend.findMany({
        where: {
          OR: [
            { userId },
            { friendId: userId },
          ],
        },
      });

      const friendIds = friendships.map(f => (f.userId === userId ? f.friendId : f.userId));
      whereClause.userId = { in: [...friendIds, userId] };
    }

    // Check if current user is premium
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    const isPremium = user ? isPremiumUser(user) : false;

    // Total count for metadata
    const totalCount = await prisma.userLeaderboardStats.count({ where: whereClause });

    // ----------------------------
    // FREE USER GLOBAL LEADERBOARD
    // ----------------------------
    if (scope === 'global' && !isPremium) {
      const TOP_N = 50;

      // Fetch all users sorted by handicap
      const allStats = await prisma.userLeaderboardStats.findMany({
        where: whereClause,
        include: {
          user: { select: { profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
        },
        orderBy: [{ handicap: 'asc' }],
      });

      // Map users with actual global rank
      const allUsers = allStats.map((s, index) => ({
        rank: index + 1, // real global rank
        user_id: Number(s.userId),
        handicap: s.handicap ?? null,
        average_score: s.averageToPar ?? null,
        best_score: s.bestToPar,
        total_rounds: s.totalRounds,
        first_name: s.user.profile?.firstName ?? null,
        last_name: s.user.profile?.lastName ?? null,
        avatar_url: s.user.profile?.avatarUrl ?? undefined,
      }));

      // Find current user
      const currentUser = allUsers.find(u => BigInt(u.user_id) === userId);

      // Take top N users
      let finalUsers = allUsers.slice(0, TOP_N);

      // Include current user if not in top N
      if (currentUser && !finalUsers.some(u => u.user_id === currentUser.user_id)) {
        finalUsers.push(currentUser);
      }

      // Sort by actual rank so the current user appears in correct order
      finalUsers.sort((a, b) => a.rank - b.rank);

      return successResponse({
        users: finalUsers,      // frontend should display rank using `rank` field
        isPremium,
        totalUsers: allUsers.length,
        showingLimited: true,
        hasMore: false,
      });
    }

    // ----------------------------
    // PREMIUM USERS OR FRIENDS
    // ----------------------------
    const stats = await prisma.userLeaderboardStats.findMany({
      where: whereClause,
      include: {
        user: { select: { profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
      },
      orderBy: [{ handicap: 'asc' }],
      take: limit,
      skip,
    });

    const users = stats.map(s => ({
      user_id: Number(s.userId),
      handicap: s.handicap ?? null,
      average_score: s.averageToPar ?? null,
      best_score: s.bestToPar,
      total_rounds: s.totalRounds,
      first_name: s.user.profile?.firstName ?? null,
      last_name: s.user.profile?.lastName ?? null,
      avatar_url: s.user.profile?.avatarUrl ?? undefined,
    }));

    return successResponse({
      users,
      isPremium,
      totalUsers: totalCount,
      showingLimited: false,
      hasMore: skip + limit < totalCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('GET /api/leaderboard error:', error);
    return errorResponse('Database error', 500);
  }
}
