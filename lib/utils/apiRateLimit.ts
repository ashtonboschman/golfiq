import { prisma } from '@/lib/db';

export type ApiUsageLogStatus = 'success' | 'error';

export type LogApiCallInput = {
  endpoint: string;
  userId?: bigint | null;
  provider?: string | null;
  searchQuery?: string | null;
  usedLocation?: boolean;
  resultCount?: number | null;
  status?: ApiUsageLogStatus;
  errorCode?: string | null;
};

/**
 * Check if the global API rate limit has been exceeded for today
 * @param endpoint - The endpoint identifier (e.g., "golf-course-api-search")
 * @param dailyLimit - Maximum calls allowed per day (default: 200)
 * @returns Object with canProceed boolean and callsUsed count
 */
export async function checkRateLimit(
  endpoint: string,
  dailyLimit: number = 200
): Promise<{ canProceed: boolean; callsUsed: number; limit: number }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  // Count API calls for this endpoint today
  const callsToday = await prisma.apiUsageLog.count({
    where: {
      endpoint,
      createdAt: {
        gte: startOfDay,
      },
    },
  });

  return {
    canProceed: callsToday < dailyLimit,
    callsUsed: callsToday,
    limit: dailyLimit,
  };
}

/**
 * Log an API call to the usage tracking table.
 * This is best used for actual upstream API attempts rather than local validation failures.
 */
export async function logApiCall({
  endpoint,
  userId = null,
  provider = null,
  searchQuery = null,
  usedLocation = false,
  resultCount = null,
  status = 'success',
  errorCode = null,
}: LogApiCallInput): Promise<void> {
  await prisma.apiUsageLog.create({
    data: {
      endpoint,
      userId,
      provider,
      searchQuery,
      usedLocation,
      resultCount,
      status,
      errorCode,
    },
  });
}

/**
 * Get API usage stats for display to users
 * @param endpoint - The endpoint identifier
 * @returns Object with callsUsed and limit
 */
export async function getApiUsageStats(
  endpoint: string,
  dailyLimit: number = 200
): Promise<{ callsUsed: number; limit: number; remaining: number }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  const callsToday = await prisma.apiUsageLog.count({
    where: {
      endpoint,
      createdAt: {
        gte: startOfDay,
      },
    },
  });

  return {
    callsUsed: callsToday,
    limit: dailyLimit,
    remaining: Math.max(0, dailyLimit - callsToday),
  };
}
