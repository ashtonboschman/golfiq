import { prisma } from '@/lib/db';
import { normalizeRoundsByMode, calculateHandicap } from './handicap';

export async function recalcLeaderboard(userId: bigint): Promise<void> {
  // Fetch rounds for the user
  const rounds = await prisma.round.findMany({
    where: {
      userId,
    },
    select: {
      score: true,
      toPar: true,
      firHit: true,
      girHit: true,
      putts: true,
      penalties: true,
      tee: {
        select: {
          numberOfHoles: true,
          courseRating: true,
          slopeRating: true,
          parTotal: true,
        },
      },
    },
  });

  if (!rounds.length) {
    // No rounds: clear leaderboard stats
    await prisma.userLeaderboardStats.upsert({
      where: { userId },
      create: {
        userId,
        averageScore: null,
        bestScore: null,
        averageToPar: null,
        bestToPar: null,
        handicap: null,
        totalRounds: 0,
      },
      update: {
        averageScore: null,
        bestScore: null,
        averageToPar: null,
        bestToPar: null,
        handicap: null,
        totalRounds: 0,
      },
    });
    return;
  }

  // Transform to format expected by handicap utils
  const roundsWithHoles = rounds.map(r => ({
    holes: r.tee.numberOfHoles ?? 18,
    score: r.score,
    toPar: r.toPar,
    rating: r.tee.courseRating ? Number(r.tee.courseRating) : 72,
    slope: r.tee.slopeRating ?? 113,
    par: r.tee.parTotal ?? 72,
    fir_hit: r.firHit,
    fir_total: 14, // Typical value, adjust if needed
    gir_hit: r.girHit,
    gir_total: 18,
    putts: r.putts,
    penalties: r.penalties,
  }));

  // Normalize all rounds to combined mode (doubles 9-hole rounds)
  const combinedRounds = normalizeRoundsByMode(roundsWithHoles, 'combined');

  const totalRounds = combinedRounds.length;
  const sumScore = combinedRounds.reduce((sum, r) => sum + r.score, 0);
  const bestScore = Math.min(...combinedRounds.map(r => r.score));

  // Calculate toPar stats (only for rounds with toPar values)
  const roundsWithToPar = combinedRounds.filter(r => r.toPar !== null && r.toPar !== undefined);
  const averageToPar = roundsWithToPar.length > 0
    ? roundsWithToPar.reduce((sum, r) => sum + r.toPar!, 0) / roundsWithToPar.length
    : null;
  const bestToPar = roundsWithToPar.length > 0
    ? Math.min(...roundsWithToPar.map(r => r.toPar!))
    : null;

  // Handicap calculation
  const handicap = calculateHandicap(combinedRounds);

  // Update leaderboard stats
  await prisma.userLeaderboardStats.upsert({
    where: { userId },
    create: {
      userId,
      averageScore: sumScore / totalRounds,
      bestScore,
      averageToPar,
      bestToPar,
      handicap,
      totalRounds,
    },
    update: {
      averageScore: sumScore / totalRounds,
      bestScore,
      averageToPar,
      bestToPar,
      handicap,
      totalRounds,
    },
  });
}
