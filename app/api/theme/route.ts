import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { z } from 'zod';

const AVAILABLE_THEMES = [
  'dark', 'light', 'sunrise', 'twilight', 'classic', 'metallic',
  'oceanic', 'aurora', 'forest', 'minimalist', 'sunset'
];

const PREMIUM_THEMES = [
  'sunrise', 'twilight', 'classic', 'metallic',
  'oceanic', 'aurora', 'forest', 'minimalist', 'sunset'
];

const updateThemeSchema = z.object({
  theme: z.enum(['dark', 'light', 'sunrise', 'twilight', 'classic', 'metallic', 'oceanic', 'aurora', 'forest', 'minimalist', 'sunset'] as [string, ...string[]]),
});

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const result = updateThemeSchema.safeParse(body);
    if (!result.success) {
      return errorResponse('Invalid theme selection', 400);
    }

    const { theme } = result.data;

    // Check if theme requires premium
    if (PREMIUM_THEMES.includes(theme)) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true },
      });

      if (!user || (user.subscriptionTier !== 'premium' && user.subscriptionTier !== 'lifetime')) {
        return errorResponse('This theme requires a Premium subscription', 403);
      }
    }

    // Update theme in user profile
    await prisma.userProfile.update({
      where: { userId },
      data: { theme },
    });

    return successResponse({ message: 'Theme updated successfully', theme });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Update theme error:', error);
    return errorResponse('Failed to update theme', 500);
  }
}
