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
      userId?: { in: bigint[] };
    };

    const whereClause: WhereClause = {
      totalRounds: { gt: 0 },
    };

    if (scope === 'friends') {
      // Get user's friend IDs
      const friendships = await prisma.friend.findMany({
        where: {
          OR: [
            { userId },
            { friendId: userId },
          ],
        },
      });

      const friendIds = friendships.map((f: any) =>
        f.userId === userId ? f.friendId : f.userId
      );

      // Include user + friends
      whereClause.userId = {
        in: [...friendIds, userId],
      };
    }

    // Get user's subscription tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    const isPremium = user ? isPremiumUser(user) : false;

    // Get total count for metadata
    const totalCount = await prisma.userLeaderboardStats.count({
      where: whereClause,
    });

    // For free users on global leaderboard, we need special handling
    if (scope === 'global' && !isPremium) {
      // Get all users for ranking purposes (needed to find user's position)
      const allStats = await prisma.userLeaderboardStats.findMany({
        where: whereClause,
        include: {
          user: {
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
        orderBy: [
          { handicap: 'asc' },
        ],
      });

      const allUsers = allStats.map((s: any) => ({
        user_id: Number(s.userId),
        handicap: s.handicap ? Number(s.handicap) : null,
        average_score: s.averageToPar ? Number(s.averageToPar) : null,
        best_score: s.bestToPar,
        total_rounds: s.totalRounds,
        first_name: s.user.profile?.firstName,
        last_name: s.user.profile?.lastName,
        avatar_url: s.user.profile?.avatarUrl,
      }));

      // Find user's rank
      const userIndex = allUsers.findIndex((u: any) => BigInt(u.user_id) === userId);

      // Get top 100 + user context
      const top100 = allUsers.slice(0, 100);
      let finalUsers = top100;

      if (userIndex > 99) {
        // User is outside top 100, include their context (±5)
        const contextStart = Math.max(0, userIndex - 5);
        const contextEnd = Math.min(allUsers.length, userIndex + 6);
        const userContext = allUsers.slice(contextStart, contextEnd);

        // Merge top 100 with user context, remove duplicates
        const seen = new Set(top100.map((u: any) => u.user_id));
        const unique = [...top100];

        for (const u of userContext) {
          if (!seen.has(u.user_id)) {
            unique.push(u);
            seen.add(u.user_id);
          }
        }

        finalUsers = unique;
      }

      // Apply pagination to the filtered result
      const paginatedUsers = finalUsers.slice(skip, skip + limit);

      return successResponse({
        users: paginatedUsers,
        isPremium,
        totalUsers: allUsers.length,
        showingLimited: allUsers.length > 100,
        hasMore: skip + limit < finalUsers.length,
      });
    }

    // Premium users or friends scope: use regular pagination
    const stats = await prisma.userLeaderboardStats.findMany({
      where: whereClause,
      include: {
        user: {
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
      orderBy: [
        { handicap: 'asc' },
      ],
      take: limit,
      skip,
    });

    const users = stats.map((s: any) => ({
      user_id: Number(s.userId),
      handicap: s.handicap ? Number(s.handicap) : null,
      average_score: s.averageToPar ? Number(s.averageToPar) : null,
      best_score: s.bestToPar,
      total_rounds: s.totalRounds,
      first_name: s.user.profile?.firstName,
      last_name: s.user.profile?.lastName,
      avatar_url: s.user.profile?.avatarUrl,
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
