import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { z } from 'zod';

const updateUserSchema = z.object({
  username: z.string().trim().min(1).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const result = updateUserSchema.safeParse(body);
    if (!result.success) {
      return errorResponse('Invalid input', 400);
    }

    const { username, email } = result.data;

    if (!username && !email) {
      return errorResponse('At least one field must be provided', 400);
    }

    // Build update data
    const updateData: { username?: string; email?: string } = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return successResponse({ message: 'User information updated successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    // Handle unique constraint violations
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const prismaError = error as { meta?: { target?: string[] } };
      const field = prismaError.meta?.target?.[0];
      if (field === 'username') {
        return errorResponse('Username is already in use', 400);
      }
      if (field === 'email') {
        return errorResponse('Email is already registered', 400);
      }
    }

    console.error('Update user error:', error);
    return errorResponse('Failed to update user information', 500);
  }
}
