import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const userId = await requireAuth(request as any);

    const notifications = await prisma.friendNotification.findMany({
      where: {
        userId,
        type: 'friend_request_accepted',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      select: {
        id: true,
        actorUserId: true,
        type: true,
        readAt: true,
        createdAt: true,
        actorUser: {
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
      results: notifications.map((notification) => ({
        id: Number(notification.id),
        actor_user_id: Number(notification.actorUserId),
        type: notification.type,
        first_name: notification.actorUser.profile?.firstName ?? '',
        last_name: notification.actorUser.profile?.lastName ?? '',
        avatar_url: notification.actorUser.profile?.avatarUrl ?? '/avatars/default.png',
        read_at: notification.readAt?.toISOString() ?? null,
        created_at: notification.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/friends/notifications error:', error);
    return errorResponse('Database error', 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuth(request as any);
    const readAt = new Date();

    const result = await prisma.friendNotification.updateMany({
      where: {
        userId,
        type: 'friend_request_accepted',
        readAt: null,
      },
      data: {
        readAt,
      },
    });

    return successResponse({
      message: 'Friend notifications marked as read',
      updatedCount: result.count,
      readAt: readAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/friends/notifications error:', error);
    return errorResponse('Database error', 500);
  }
}
