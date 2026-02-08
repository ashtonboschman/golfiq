import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { generateAndStoreOverallInsights } from '@/app/api/insights/overall/route';

const MANUAL_REFRESH_COOLDOWN_HOURS = 0;

export async function POST(request: NextRequest) {
  try {
    const overallInsightModel = (prisma as any).overallInsight;
    if (!overallInsightModel) {
      return errorResponse('Prisma client is missing model "overallInsight". Run `npx prisma generate` and restart the server.', 500);
    }

    const userId = await requireAuth(request);

    const existing = await overallInsightModel.findUnique({
      where: { userId },
      select: { lastManualRefreshAt: true },
    });

    if (MANUAL_REFRESH_COOLDOWN_HOURS > 0 && existing?.lastManualRefreshAt) {
      const nextAllowed = new Date(existing.lastManualRefreshAt);
      nextAllowed.setHours(nextAllowed.getHours() + MANUAL_REFRESH_COOLDOWN_HOURS);
      if (new Date() < nextAllowed) {
        return errorResponse(
          `Manual refresh available after ${nextAllowed.toISOString()}`,
          429,
        );
      }
    }

    const payload = await generateAndStoreOverallInsights(userId, true);
    return successResponse({ insights: payload });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return errorResponse('Database table "overall_insights" is missing. Apply the latest SQL migration.', 500);
    }
    if (error.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    return errorResponse(error.message || 'Failed to regenerate overall insights', 500);
  }
}
