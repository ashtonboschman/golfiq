import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  gender: z.enum(['male', 'female', 'unspecified']).nullable().optional(),
  default_tee: z.enum(['blue', 'white', 'red', 'gold', 'black']).nullable().optional(),
  favorite_course_id: z.union([z.string(), z.number()]).nullable().optional(),
  dashboard_visibility: z.enum(['private', 'friends', 'public']).nullable().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const result = updateProfileSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues?.[0];
      return errorResponse(firstError?.message || 'Validation failed', 400);
    }

    const data = result.data;

    if (Object.keys(data).length === 0) {
      return errorResponse('No profile fields provided', 400);
    }

    // Map snake_case to camelCase for Prisma
    const updateData: any = {};
    if (data.first_name !== undefined) updateData.firstName = data.first_name;
    if (data.last_name !== undefined) updateData.lastName = data.last_name;
    if (data.avatar_url !== undefined) updateData.avatarUrl = data.avatar_url;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.default_tee !== undefined) updateData.defaultTee = data.default_tee;
    if (data.favorite_course_id !== undefined) {
      if (data.favorite_course_id === null || data.favorite_course_id === '') {
        updateData.favoriteCourseId = null;
      } else {
        const courseIdNum = typeof data.favorite_course_id === 'string'
          ? Number(data.favorite_course_id)
          : data.favorite_course_id;
        updateData.favoriteCourseId = BigInt(courseIdNum);
      }
    }
    if (data.dashboard_visibility !== undefined) {
      updateData.dashboardVisibility = data.dashboard_visibility;
    }

    await prisma.userProfile.update({
      where: { userId },
      data: updateData,
    });

    return successResponse({ message: 'Profile updated successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Update profile error:', error);
    return errorResponse('Failed to update profile', 500);
  }
}
