import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { z } from 'zod';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

const profileUpdateSchema = z.object({
  first_name: z.union([z.string().trim().max(100), z.null()]).optional(),
  last_name: z.union([z.string().trim().max(100), z.null()]).optional(),
  avatar_url: z.string().trim().max(255).optional(),
  bio: z.union([z.string().trim().max(500), z.null()]).optional(),
  gender: z.enum(['male', 'female', 'unspecified']).optional(),
  default_tee: z.enum(['blue', 'white', 'red', 'gold', 'black']).optional(),
  favorite_course_id: z.union([z.string().trim(), z.number(), z.null()]).optional(),
  dashboard_visibility: z.enum(['private', 'friends', 'public']).optional(),
  theme: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  username: z.string().trim().min(1).max(100).regex(USERNAME_REGEX, 'Username can only include letters, numbers, and underscores').optional(),
  show_strokes_gained: z.boolean().optional(),
}).strict();

function normalizeProfileUpdateInput(body: Record<string, unknown>) {
  return {
    first_name: body.first_name,
    last_name: body.last_name,
    avatar_url: body.avatar_url,
    bio: body.bio,
    gender: body.gender,
    default_tee: body.default_tee,
    favorite_course_id: body.favorite_course_id,
    dashboard_visibility: body.dashboard_visibility,
    theme: body.theme,
    email: body.email,
    username: body.username,
    show_strokes_gained: body.show_strokes_gained,
  };
}

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
        createdAt: true,
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
      created_at: user.createdAt,
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid request body', 400);
    }

    const normalizedInput = normalizeProfileUpdateInput(body as Record<string, unknown>);
    const parsed = profileUpdateSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid profile payload', 400);
    }

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
    } = parsed.data;

    let favoriteCourseId: bigint | null | undefined = undefined;
    if (favorite_course_id === null) {
      favoriteCourseId = null;
    } else if (favorite_course_id !== undefined) {
      const parsedFavoriteId = typeof favorite_course_id === 'number'
        ? favorite_course_id
        : Number(favorite_course_id);
      if (!Number.isFinite(parsedFavoriteId) || parsedFavoriteId <= 0) {
        return errorResponse('favorite_course_id must be a valid positive number', 400);
      }
      favoriteCourseId = BigInt(parsedFavoriteId);
    }

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
        favoriteCourseId,
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
        created_at: updatedUser.createdAt,
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
