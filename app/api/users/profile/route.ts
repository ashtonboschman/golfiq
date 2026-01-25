import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    // Get user + profile
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
            theme: true,
            showStrokesGained: true
          },
        },
      },
    });

    if (!user || !user.profile) {
      return errorResponse('User or profile not found', 404);
    }

    // Flatten and serialize BigInt
    const response = {
      id: user.id.toString(),
      username: user.username,
      email: user.email,
      email_verified: user.emailVerified,
      created_date: user.createdDate,
      first_name: user.profile.firstName,
      last_name: user.profile.lastName,
      avatar_url: user.profile.avatarUrl,
      bio: user.profile.bio,
      gender: user.profile.gender,
      default_tee: user.profile.defaultTee,
      favorite_course_id: user.profile.favoriteCourseId
        ? user.profile.favoriteCourseId.toString()
        : null,
      dashboard_visibility: user.profile.dashboardVisibility,
      theme: user.profile.theme || 'dark',
      showStrokesGained: user.profile.showStrokesGained,
    };

    return successResponse({ profile: response });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('Get profile error:', error);
    return errorResponse('Failed to fetch profile', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    // Destructure fields from body
    const {
      first_name,
      last_name,
      avatar_url,
      bio,
      gender,
      default_tee,
      favorite_course_id,
      dashboard_visibility,
      theme,
      email,
      username,
      show_strokes_gained,
    } = body;

    // Update profile fields
    const updatedProfile = await prisma.userProfile.update({
      where: { userId },
      data: {
        firstName: first_name,
        lastName: last_name,
        avatarUrl: avatar_url,
        bio,
        gender,
        defaultTee: default_tee,
        favoriteCourseId: favorite_course_id ? Number(favorite_course_id) : null,
        dashboardVisibility: dashboard_visibility,
        theme,
        showStrokesGained: show_strokes_gained,
      },
    });

    // Optional: allow updating email/username if provided
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email: email ?? undefined,
        username: username ?? undefined,
      },
    });

    return successResponse({
      message: 'Profile updated successfully',
      profile: {
        id: updatedUser.id.toString(),
        username: updatedUser.username,
        email: updatedUser.email,
        email_verified: updatedUser.emailVerified,
        created_date: updatedUser.createdDate,
        first_name: updatedProfile.firstName,
        last_name: updatedProfile.lastName,
        avatar_url: updatedProfile.avatarUrl,
        bio: updatedProfile.bio,
        gender: updatedProfile.gender,
        default_tee: updatedProfile.defaultTee,
        favorite_course_id: updatedProfile.favoriteCourseId
          ? updatedProfile.favoriteCourseId.toString()
          : null,
        dashboard_visibility: updatedProfile.dashboardVisibility,
        theme: updatedProfile.theme || 'dark',
        show_strokes_gained: updatedProfile.showStrokesGained,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('Update profile error:', error);
    return errorResponse('Failed to update profile', 500);
  }
}