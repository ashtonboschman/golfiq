import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { getBlockStateBetweenUsers } from '@/lib/socialSafety';

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

    // Check if viewing own profile
    const isSelf = viewerUserId === targetUserId;

    if (isSelf) {
      const stats = await prisma.userLeaderboardStats.findUnique({
        where: { userId: targetUserId },
        select: {
          handicap: true,
          totalRounds: true,
          averageToPar: true,
          bestToPar: true,
        },
      });

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
          average_to_par: stats?.averageToPar != null ? Number(stats.averageToPar) : null,
          best_to_par: stats?.bestToPar != null ? Number(stats.bestToPar) : null,
        },
        relationship: { is_self: true, status: 'self' },
        permissions: { can_view_dashboard: true, can_view_stats: true },
      });
    }

    const blockState = await getBlockStateBetweenUsers(viewerUserId, targetUserId);

    // Check if friends
    const friendship = blockState.eitherBlocked
      ? null
      : await prisma.friend.findFirst({
          where: {
            OR: [
              { userId: viewerUserId, friendId: targetUserId },
              { userId: targetUserId, friendId: viewerUserId },
            ],
          },
        });

    let relationshipStatus = blockState.eitherBlocked ? 'blocked' : friendship ? 'friends' : 'none';

    // Check friend requests if not friends
    if (!friendship && !blockState.eitherBlocked) {
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

    const canViewDashboard = !blockState.eitherBlocked && (
      user.profile?.dashboardVisibility === 'public' ||
      (user.profile?.dashboardVisibility === 'friends' &&
        relationshipStatus === 'friends')
    );
    const canViewStats = !blockState.eitherBlocked;

    const stats = canViewStats
      ? await prisma.userLeaderboardStats.findUnique({
          where: { userId: targetUserId },
          select: {
            handicap: true,
            totalRounds: true,
            averageToPar: true,
            bestToPar: true,
          },
        })
      : null;

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
        total_rounds: stats?.totalRounds ?? null,
        average_to_par: stats?.averageToPar != null ? Number(stats.averageToPar) : null,
        best_to_par: stats?.bestToPar != null ? Number(stats.bestToPar) : null,
      },
      relationship: {
        is_self: false,
        status: relationshipStatus,
        blocked_by_viewer: blockState.blockedByA,
        blocked_viewer: blockState.blockedByB,
      },
      permissions: {
        can_view_dashboard: canViewDashboard,
        can_view_stats: canViewStats,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Get user public error:', error);
    return errorResponse('Failed to load user profile', 500);
  }
}
