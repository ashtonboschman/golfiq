import { prisma } from '@/lib/db';

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
      createdDate: {
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
 * Log an API call to the usage tracking table
 * @param endpoint - The endpoint identifier
 * @param userId - Optional user ID (null for unauthenticated requests)
 * @param ipAddress - Optional IP address
 */
export async function logApiCall(
  endpoint: string,
  userId?: bigint | null,
  ipAddress?: string | null
): Promise<void> {
  await prisma.apiUsageLog.create({
    data: {
      endpoint,
      userId,
      ipAddress,
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
      createdDate: {
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
