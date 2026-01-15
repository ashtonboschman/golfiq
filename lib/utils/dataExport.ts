import { prisma } from '@/lib/db';
import { isPremiumUser } from '@/lib/subscription';

/**
 * Check if user can export data based on their subscription tier
 * Free users: 1 export per month (CSV only)
 * Premium users: Unlimited exports (CSV, Excel, JSON)
 */
export async function canUserExport(userId: bigint): Promise<{
  canExport: boolean;
  reason?: string;
  exportsThisMonth?: number;
  limit?: number;
}> {
  // Check subscription tier
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  if (!user) {
    return { canExport: false, reason: 'User not found' };
  }

  const isPremium = isPremiumUser(user);

  // Premium users have unlimited exports
  if (isPremium) {
    return { canExport: true };
  }

  // Free users: check monthly limit
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const exportsThisMonth = await prisma.dataExport.count({
    where: {
      userId,
      createdDate: {
        gte: firstDayOfMonth,
      },
    },
  });

  const limit = 1;
  const canExport = exportsThisMonth < limit;

  return {
    canExport,
    reason: canExport ? undefined : `Free users are limited to ${limit} export per month. Upgrade to Premium for unlimited exports.`,
    exportsThisMonth,
    limit,
  };
}

/**
 * Record a data export
 */
export async function recordDataExport(params: {
  userId: bigint;
  format: 'csv' | 'excel' | 'json';
  recordCount: number;
}): Promise<void> {
  await prisma.dataExport.create({
    data: {
      userId: params.userId,
      format: params.format,
      recordCount: params.recordCount,
    },
  });
}

/**
 * Get user's export history
 */
export async function getUserExportHistory(userId: bigint, limit: number = 10) {
  return await prisma.dataExport.findMany({
    where: { userId },
    orderBy: { createdDate: 'desc' },
    take: limit,
  });
}

/**
 * Get export stats for current month
 */
export async function getMonthlyExportStats(userId: bigint) {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const exports = await prisma.dataExport.findMany({
    where: {
      userId,
      createdDate: {
        gte: firstDayOfMonth,
      },
    },
    orderBy: { createdDate: 'desc' },
  });

  return {
    count: exports.length,
    exports: exports.map(e => ({
      format: e.format,
      recordCount: e.recordCount,
      date: e.createdDate,
    })),
  };
}
