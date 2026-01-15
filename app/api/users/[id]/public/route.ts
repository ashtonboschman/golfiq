import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const viewerUserId = await requireAuth(request);
    const { id } = await params;
    const targetUserId = BigInt(id);

    // Fetch user + profile + favorite course
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            bio: true,
            dashboardVisibility: true,
            favoriteCourse: {
              select: {
                courseName: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // Fetch leaderboard stats
    const stats = await prisma.userLeaderboardStats.findUnique({
      where: { userId: targetUserId },
      select: {
        handicap: true,
        totalRounds: true,
        averageScore: true,
        bestScore: true,
      },
    });

    const statsData = stats || {
      handicap: null,
      totalRounds: 0,
      averageScore: null,
      bestScore: null,
    };

    // Check if viewing own profile
    const isSelf = viewerUserId === targetUserId;

    if (isSelf) {
      return successResponse({
        user: {
          id: user.id.toString(),
          username: user.username,
          first_name: user.profile?.firstName,
          last_name: user.profile?.lastName,
          avatar_url: user.profile?.avatarUrl,
          bio: user.profile?.bio,
          dashboard_visibility: user.profile?.dashboardVisibility,
          favorite_course: user.profile?.favoriteCourse?.courseName || null,
        },
        stats: {
          handicap: stats?.handicap ? Number(stats.handicap) : null,
          total_rounds: stats?.totalRounds || 0,
          average_score: stats?.averageScore ? Number(stats.averageScore) : null,
          best_score: stats?.bestScore || null,
        },
        relationship: { is_self: true, status: 'self' },
        permissions: { can_view_dashboard: true },
      });
    }

    // Check if friends
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: viewerUserId, friendId: targetUserId },
          { userId: targetUserId, friendId: viewerUserId },
        ],
      },
    });

    let relationshipStatus = friendship ? 'friends' : 'none';

    // Check friend requests if not friends
    if (!friendship) {
      const friendRequest = await prisma.friendRequest.findFirst({
        where: {
          OR: [
            { requesterId: viewerUserId, recipientId: targetUserId },
            { requesterId: targetUserId, recipientId: viewerUserId },
          ],
        },
        select: {
          requesterId: true,
        },
      });

      if (friendRequest) {
        relationshipStatus =
          friendRequest.requesterId === viewerUserId ? 'pending_sent' : 'pending_received';
      }
    }

    const canViewDashboard =
      user.profile?.dashboardVisibility === 'public' ||
      (user.profile?.dashboardVisibility === 'friends' && relationshipStatus === 'friends');

    return successResponse({
      user: {
        id: user.id.toString(),
        username: user.username,
        first_name: user.profile?.firstName,
        last_name: user.profile?.lastName,
        avatar_url: user.profile?.avatarUrl,
        bio: user.profile?.bio,
        dashboard_visibility: user.profile?.dashboardVisibility,
        favorite_course: user.profile?.favoriteCourse?.courseName || null,
      },
      stats: {
        handicap: stats?.handicap ? Number(stats.handicap) : null,
        total_rounds: stats?.totalRounds || 0,
        average_score: stats?.averageScore ? Number(stats.averageScore) : null,
        best_score: stats?.bestScore || null,
      },
      relationship: { is_self: false, status: relationshipStatus },
      permissions: { can_view_dashboard: canViewDashboard },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Get user public error:', error);
    return errorResponse('Failed to load user profile', 500);
  }
}
