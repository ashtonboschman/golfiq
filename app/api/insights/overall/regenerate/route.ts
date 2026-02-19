import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { generateAndStoreOverallInsights } from '@/app/api/insights/overall/route';

const MANUAL_REFRESH_COOLDOWN_HOURS = 0;

function parseMode(searchParams: URLSearchParams): 'combined' | '9' | '18' {
  const mode = searchParams.get('statsMode');
  if (mode === '9' || mode === '18' || mode === 'combined') return mode;
  return 'combined';
}

export async function POST(request: NextRequest) {
  try {
    const overallInsightModel = (prisma as any).overallInsight;
    if (!overallInsightModel) {
      return errorResponse('Prisma client is missing model "overallInsight". Run `npx prisma generate` and restart the server.', 500);
    }

    const userId = await requireAuth(request);
    const mode = parseMode(new URL(request.url).searchParams);

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

    const payload = await generateAndStoreOverallInsights(userId, true, mode);
    return successResponse({ insights: payload });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return errorResponse('Database table "overall_insights" is missing. Apply the latest SQL migration.', 500);
    }
    if (error.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    return errorResponse(error.message || 'Failed to regenerate overall insights', 500);
  }
}
