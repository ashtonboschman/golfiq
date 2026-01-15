import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse, serializeBigInt } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        createdDate: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            bio: true,
            gender: true,
            defaultTee: true,
            favoriteCourseId: true,
            dashboardVisibility: true,
          },
        },
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // Flatten the response
    const response = {
      id: user.id.toString(),
      username: user.username,
      email: user.email,
      email_verified: user.emailVerified,
      created_date: user.createdDate,
      first_name: user.profile?.firstName,
      last_name: user.profile?.lastName,
      avatar_url: user.profile?.avatarUrl,
      bio: user.profile?.bio,
      gender: user.profile?.gender,
      default_tee: user.profile?.defaultTee,
      favorite_course_id: user.profile?.favoriteCourseId?.toString(),
      dashboard_visibility: user.profile?.dashboardVisibility,
    };

    return successResponse({ user: response });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('Get user error:', error);
    return errorResponse('Failed to retrieve user profile', 500);
  }
}
