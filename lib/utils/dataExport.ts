import { prisma } from '@/lib/db';

/**
 * Check if user can export data.
 * Exports are available to all users.
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

  return { canExport: true };
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
    orderBy: { createdAt: 'desc' },
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
      createdAt: {
        gte: firstDayOfMonth,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    count: exports.length,
    exports: exports.map(e => ({
      format: e.format,
      recordCount: e.recordCount,
      date: e.createdAt,
    })),
  };
}
