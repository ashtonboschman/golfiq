import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/api-auth';

export async function bootstrapUser() {
  const userId = await getAuthUser();
  if (!userId) return;

  // Ensure UserProfile exists
  await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      theme: 'dark',
    },
  });

  // Optional: leaderboard stats bootstrap (recommended)
  await prisma.userLeaderboardStats.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      totalRounds: 0,
    },
  });
}
