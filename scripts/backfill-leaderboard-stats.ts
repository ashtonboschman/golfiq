/**
 * Recalculate leaderboard stats for all users
 * This will backfill average_to_par and best_to_par values
 */

import { prisma } from '../lib/db';
import { recalcLeaderboard } from '../lib/utils/leaderboard';

async function backfillLeaderboardStats() {
  try {
    console.log('Finding all users with rounds...');

    const users = await prisma.user.findMany({
      where: {
        rounds: {
          some: {}
        }
      },
      select: {
        id: true,
        username: true,
        _count: {
          select: {
            rounds: true
          }
        }
      }
    });

    console.log(`Found ${users.length} users with rounds`);

    if (users.length === 0) {
      console.log('No users with rounds found!');
      return;
    }

    console.log('Recalculating leaderboard stats for all users...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        await recalcLeaderboard(user.id);
        successCount++;
        console.log(`✅ ${user.username} - ${user._count.rounds} rounds (${successCount}/${users.length})`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed for ${user.username}:`, error);
      }
    }

    console.log(`\n✅ Successfully recalculated stats for ${successCount} users`);
    if (errorCount > 0) {
      console.log(`❌ Failed for ${errorCount} users`);
    }

    // Show sample of updated stats
    const updatedStats = await prisma.userLeaderboardStats.findMany({
      include: {
        user: {
          select: {
            username: true
          }
        }
      },
      take: 10,
      orderBy: {
        totalRounds: 'desc'
      }
    });

    console.log('\nSample of updated stats:');
    updatedStats.forEach(stat => {
      console.log(`  - ${stat.user.username}:`);
      console.log(`    Handicap: ${stat.handicap ? Number(stat.handicap).toFixed(1) : 'N/A'}`);
      console.log(`    Average Score: ${stat.averageScore ? Number(stat.averageScore).toFixed(1) : 'N/A'}`);
      console.log(`    Average To Par: ${stat.averageToPar ? Number(stat.averageToPar).toFixed(1) : 'N/A'}`);
      console.log(`    Best Score: ${stat.bestScore ?? 'N/A'}`);
      console.log(`    Best To Par: ${stat.bestToPar ? Number(stat.bestToPar).toFixed(1) : 'N/A'}`);
      console.log(`    Total Rounds: ${stat.totalRounds}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error backfilling leaderboard stats:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backfillLeaderboardStats()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
