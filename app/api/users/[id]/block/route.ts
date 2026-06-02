import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { clearSocialGraphBetweenUsers } from '@/lib/socialSafety';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const blockerId = await requireAuth(request);
    const { id } = await params;
    const blockedUserId = BigInt(id);

    if (blockerId === blockedUserId) {
      return errorResponse('You cannot block your own profile.', 400);
    }

    const blockedUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    });
    if (!blockedUser) {
      return errorResponse('User not found.', 404);
    }

    await prisma.userBlock.upsert({
      where: {
        blockerId_blockedUserId: {
          blockerId,
          blockedUserId,
        },
      },
      update: {},
      create: {
        blockerId,
        blockedUserId,
      },
    });

    await clearSocialGraphBetweenUsers(blockerId, blockedUserId);

    return successResponse({
      message: 'User blocked.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('POST /api/users/[id]/block error:', error);
    return errorResponse('Unable to block user right now.', 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const blockerId = await requireAuth(request);
    const { id } = await params;
    const blockedUserId = BigInt(id);

    if (blockerId === blockedUserId) {
      return errorResponse('You cannot unblock your own profile.', 400);
    }

    const result = await prisma.userBlock.deleteMany({
      where: {
        blockerId,
        blockedUserId,
      },
    });

    if (result.count === 0) {
      return errorResponse('User is not currently blocked.', 404);
    }

    return successResponse({
      message: 'User unblocked.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('DELETE /api/users/[id]/block error:', error);
    return errorResponse('Unable to unblock user right now.', 500);
  }
}
