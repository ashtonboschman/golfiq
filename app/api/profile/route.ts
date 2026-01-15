import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bio: true,
        gender: true,
        defaultTee: true,
        favoriteCourseId: true,
        dashboardVisibility: true,
        theme: true,
      },
    });

    if (!profile) {
      return errorResponse('Profile not found', 404);
    }

    // Convert BigInt to string for JSON serialization
    const profileData = {
      ...profile,
      favoriteCourseId: profile.favoriteCourseId ? profile.favoriteCourseId.toString() : null,
    };

    return successResponse({ profile: profileData });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Get profile error:', error);
    return errorResponse('Failed to fetch profile', 500);
  }
}
