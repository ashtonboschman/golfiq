import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { isPremiumUser } from '@/lib/subscription';

type SortKey = 'handicap' | 'average_score' | 'best_score';
type SortOrder = 'asc' | 'desc';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);

    const scope = searchParams.get('scope') ?? 'global';
    const limit = Number(searchParams.get('limit') ?? 25);
    const page = Number(searchParams.get('page') ?? 1);
    const skip = (page - 1) * limit;

    const sortBy = (searchParams.get('sortBy') ?? 'handicap') as SortKey;
    const sortOrder: SortOrder =
      searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

    // ============================================================
    // BASE WHERE CLAUSE
    // ============================================================
    const whereClause: {
      totalRounds: { gt: number };
      handicap?: { not: null };
      userId?: { in: bigint[] };
    } = {
      totalRounds: { gt: 0 },
      handicap: { not: null },
    };

    if (scope === 'friends') {
      const friendships = await prisma.friend.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
      });

      const friendIds = friendships.map(f =>
        f.userId === userId ? f.friendId : f.userId
      );

      whereClause.userId = { in: [...friendIds, userId] };
    }

    // ============================================================
    // SORT MAPPING
    // ============================================================
    const orderByMap = {
      handicap: { handicap: sortOrder },
      average_score: { averageToPar: sortOrder },
      best_score: { bestToPar: sortOrder },
    };

    const orderBy = orderByMap[sortBy];

    // ============================================================
    // SUBSCRIPTION
    // ============================================================
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        profile: {
          select: { firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    const isPremium = user ? isPremiumUser(user) : false;

    const totalCount = await prisma.userLeaderboardStats.count({
      where: whereClause,
    });

    // ============================================================
    // FREE USERS — GLOBAL (LIMITED)
    // ============================================================
    if (scope === 'global' && !isPremium) {
      const TOP_N = 2;

      const topStats = await prisma.userLeaderboardStats.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              profile: {
                select: { firstName: true, lastName: true, avatarUrl: true },
              },
            },
          },
        },
        orderBy: [orderBy],
        take: TOP_N,
      });

      const topUsers = await Promise.all(
        topStats.map(async s => ({
          rank: await getCompetitionRank(whereClause, sortBy, sortOrder, s, true, TOP_N),
          user_id: Number(s.userId),
          handicap: s.handicap ?? null,
          average_score: s.averageToPar ?? null,
          best_score: s.bestToPar,
          total_rounds: s.totalRounds,
          first_name: s.user.profile?.firstName ?? null,
          last_name: s.user.profile?.lastName ?? null,
          avatar_url: s.user.profile?.avatarUrl ?? undefined,
        }))
      );

      const currentStat = await prisma.userLeaderboardStats.findUnique({
        where: { userId },
      });

      if (currentStat) {
        const currentUser = {
          rank: await getCompetitionRank(whereClause, sortBy, sortOrder, currentStat, false, TOP_N),
          user_id: Number(currentStat.userId),
          handicap: currentStat.handicap ?? null,
          average_score: currentStat.averageToPar ?? null,
          best_score: currentStat.bestToPar,
          total_rounds: currentStat.totalRounds,
          first_name: user?.profile?.firstName ?? null,
          last_name: user?.profile?.lastName ?? null,
          avatar_url: user?.profile?.avatarUrl ?? undefined,
        };

        if (!topUsers.some(u => u.user_id === currentUser.user_id)) {
          topUsers.push(currentUser);
        }
      }

      topUsers.sort((a, b) => a.rank - b.rank);

      return successResponse({
        users: topUsers,
        isPremium,
        totalUsers: totalCount,
        showingLimited: topUsers.length > TOP_N ? true : false,
        hasMore: false,
      });
    }

    // ============================================================
    // PREMIUM USERS OR FRIENDS (FULL LEADERBOARD)
    // ============================================================
    const stats = await prisma.userLeaderboardStats.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            profile: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: [orderBy],
      take: limit,
      skip,
    });

    const users = await Promise.all(
      stats.map(async s => ({
        rank: await getCompetitionRank(whereClause, sortBy, sortOrder, s),
        user_id: Number(s.userId),
        handicap: s.handicap ?? null,
        average_score: s.averageToPar ?? null,
        best_score: s.bestToPar,
        total_rounds: s.totalRounds,
        first_name: s.user.profile?.firstName ?? null,
        last_name: s.user.profile?.lastName ?? null,
        avatar_url: s.user.profile?.avatarUrl ?? undefined,
      }))
    );

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

// ============================================================
// HELPERS
// ============================================================

function getSortColumn(sortBy: SortKey) {
  if (sortBy === 'handicap') return 'handicap';
  if (sortBy === 'average_score') return 'averageToPar';
  return 'bestToPar';
}

function getSortValue(sortBy: SortKey, stat: any) {
  if (sortBy === 'handicap') return stat.handicap;
  if (sortBy === 'average_score') return stat.averageToPar;
  return stat.bestToPar;
}

async function getCompetitionRank(
  whereClause: any,
  sortBy: SortKey,
  sortOrder: SortOrder,
  stat: any,
  isPremiumOrFriend = true,
  TOP_N = 2
) {
  if (!isPremiumOrFriend) {
    // For free global users, anything beyond top N shows as TOP_N+1
    const value = getSortValue(sortBy, stat);
    const column = getSortColumn(sortBy);

    const betterCount = await prisma.userLeaderboardStats.count({
      where: {
        ...whereClause,
        [column]: value === null ? { not: null } : { [sortOrder === 'asc' ? 'lt' : 'gt']: value },
      },
    });

    // Cap at TOP_N
    return betterCount < TOP_N ? betterCount + 1 : TOP_N + 1;
  }

  // Premium or friends: exact rank
  const value = getSortValue(sortBy, stat);
  const column = getSortColumn(sortBy);

  const betterCount = await prisma.userLeaderboardStats.count({
    where: {
      ...whereClause,
      [column]: value === null ? { not: null } : { [sortOrder === 'asc' ? 'lt' : 'gt']: value },
    },
  });

  return betterCount + 1;
}