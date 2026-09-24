import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { isPremiumUser } from '@/lib/subscription';
import { getBlockedUserIdsForUser } from '@/lib/socialSafety';

type SortKey = 'handicap' | 'average_score' | 'best_score';
type SortOrder = 'asc' | 'desc';

const FREE_GLOBAL_LEADERBOARD_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);

    const rawScope = searchParams.get('scope') ?? 'global';
    const scope = rawScope === 'friends' ? 'friends' : 'global';

    const rawLimit = Number(searchParams.get('limit') ?? 25);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 25;

    const rawPage = Number(searchParams.get('page') ?? 1);
    const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
    const skip = (page - 1) * limit;

    const sortByParam = searchParams.get('sortBy') ?? 'handicap';
    const sortBy: SortKey =
      sortByParam === 'average_score' || sortByParam === 'best_score' || sortByParam === 'handicap'
        ? sortByParam
        : 'handicap';
    const sortOrder: SortOrder =
      searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

    // ============================================================
    // BASE WHERE CLAUSE
    // ============================================================
    const whereClause: {
      totalRounds: { gt: number };
      handicap?: { not: null };
      userId?: { in?: bigint[]; notIn?: bigint[] };
    } = {
      totalRounds: { gt: 0 },
      handicap: { not: null },
    };

    const blockedUserIds = await getBlockedUserIdsForUser(userId);
    if (blockedUserIds.length > 0) {
      whereClause.userId = { notIn: blockedUserIds };
    }

    let friendScopeIds: bigint[] | null = null;
    if (scope === 'friends') {
      const friendships = await prisma.friend.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
      });

      const friendIds = friendships.map(f =>
        f.userId === userId ? f.friendId : f.userId
      );

      friendScopeIds = [...friendIds, userId];
      whereClause.userId = {
        ...whereClause.userId,
        in: friendScopeIds,
      };
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
        take: FREE_GLOBAL_LEADERBOARD_LIMIT,
      });

      const currentStat = await prisma.userLeaderboardStats.findUnique({
        where: { userId },
      });
      const ranks = await getLeaderboardRanks(
        [...topStats.map(s => s.userId), ...(currentStat ? [currentStat.userId] : [])],
        blockedUserIds,
        null,
        sortBy,
        sortOrder,
      );
      const topUsers = topStats.map(s => ({
        rank: ranks.get(s.userId)!,
        user_id: Number(s.userId),
        handicap: toApiNumber(s.handicap),
        average_score: toApiNumber(s.averageToPar),
        best_score: toApiNumber(s.bestToPar),
        total_rounds: s.totalRounds,
        first_name: s.user.profile?.firstName ?? null,
        last_name: s.user.profile?.lastName ?? null,
        avatar_url: s.user.profile?.avatarUrl ?? undefined,
      }));

      if (currentStat) {
        const currentUser = {
          rank: Math.min(
            ranks.get(currentStat.userId) ?? await getCompetitionRank(whereClause, sortBy, sortOrder, currentStat),
            FREE_GLOBAL_LEADERBOARD_LIMIT + 1,
          ),
          user_id: Number(currentStat.userId),
          handicap: toApiNumber(currentStat.handicap),
          average_score: toApiNumber(currentStat.averageToPar),
          best_score: toApiNumber(currentStat.bestToPar),
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
        showingLimited: topUsers.length > FREE_GLOBAL_LEADERBOARD_LIMIT,
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

    const ranks = await getLeaderboardRanks(
      stats.map(s => s.userId),
      blockedUserIds,
      friendScopeIds,
      sortBy,
      sortOrder,
    );
    const users = await Promise.all(
      stats.map(async s => ({
        rank: ranks.get(s.userId)!,
        user_id: Number(s.userId),
        handicap: toApiNumber(s.handicap),
        average_score: toApiNumber(s.averageToPar),
        best_score: toApiNumber(s.bestToPar),
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

function toApiNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Object.is(numberValue, -0) ? 0 : numberValue;
}

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

async function getLeaderboardRanks(
  userIds: bigint[],
  blockedUserIds: bigint[],
  friendScopeIds: bigint[] | null,
  sortBy: SortKey,
  sortOrder: SortOrder,
): Promise<Map<bigint, number>> {
  if (userIds.length === 0) return new Map();

  // Prisma cannot window-rank a page without loading all preceding rows. Keep
  // the ranking work in PostgreSQL and return only the requested user IDs.
  const column = Prisma.raw({
    handicap: 'handicap',
    average_score: 'average_to_par',
    best_score: 'best_to_par',
  }[sortBy]);
  const direction = Prisma.raw(sortOrder === 'asc' ? 'ASC' : 'DESC');
  const excludeBlocked = blockedUserIds.length
    ? Prisma.sql`AND user_id NOT IN (${Prisma.join(blockedUserIds)})`
    : Prisma.empty;
  const friendScope = friendScopeIds
    ? Prisma.sql`AND user_id IN (${Prisma.join(friendScopeIds)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ user_id: bigint; rank: bigint }>>`
    WITH ranked AS (
      SELECT user_id, RANK() OVER (ORDER BY ${column} ${direction} NULLS LAST) AS rank
      FROM user_leaderboard_stats
      WHERE total_rounds > 0 AND handicap IS NOT NULL ${excludeBlocked} ${friendScope}
    )
    SELECT user_id, rank FROM ranked WHERE user_id IN (${Prisma.join(userIds)})
  `;
  return new Map(rows.map(row => [row.user_id, Number(row.rank)]));
}

async function getCompetitionRank(
  whereClause: any,
  sortBy: SortKey,
  sortOrder: SortOrder,
  stat: any,
) {
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
