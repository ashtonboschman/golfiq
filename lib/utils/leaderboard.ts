// app/lib/utils/leaderboard.ts
import { prisma } from '@/lib/db';
import { normalizeRoundsByMode, calculateHandicap } from './handicap';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';

export async function recalcLeaderboard(userId: bigint): Promise<void> {
  // Fetch all rounds for the user
  const rounds = await prisma.round.findMany({
    where: { userId },
    select: {
      score: true,
      toPar: true,
      firHit: true,
      girHit: true,
      putts: true,
      penalties: true,
      date: true,
      teeSegment: true,
      tee: {
        select: {
          numberOfHoles: true,
          courseRating: true,
          slopeRating: true,
          bogeyRating: true,
          parTotal: true,
          nonPar3Holes: true,
          frontCourseRating: true,
          frontSlopeRating: true,
          frontBogeyRating: true,
          backCourseRating: true,
          backSlopeRating: true,
          backBogeyRating: true,
          holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' as const } },
        },
      },
    },
    orderBy: { date: 'asc' },
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

  // Map rounds to format expected by handicap utils via resolveTeeContext
  const roundsWithHoles = rounds.map((r: any) => {
    const teeSegment = (r.teeSegment ?? 'full') as TeeSegment;
    const ctx = resolveTeeContext(r.tee, teeSegment);
    const to_par = r.toPar ?? (r.score ? r.score - ctx.parTotal : null);
    return {
      holes: ctx.holes,
      score: r.score,
      to_par,
      rating: ctx.courseRating,
      slope: ctx.slopeRating,
      par: ctx.parTotal,
      fir_hit: r.firHit,
      fir_total: ctx.nonPar3Holes,
      gir_hit: r.girHit,
      gir_total: ctx.holes,
      putts: r.putts,
      penalties: r.penalties,
    };
  });

  // Normalize rounds to combined mode (doubles 9-hole rounds if applicable)
  const combinedRounds = normalizeRoundsByMode(roundsWithHoles, 'combined');

  // Filter only valid rounds (scores must exist, to_par must exist)
  const validRounds = combinedRounds.filter(
    (r: any) => typeof r.score === 'number' && r.score > 0 && r.to_par !== null && r.to_par !== undefined
  );

  const totalRounds = validRounds.length;

  if (!totalRounds) {
    // No valid rounds: clear leaderboard stats
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

  // Aggregate scores and to_par values
  const sumScore = validRounds.reduce((sum: any, r: any) => sum + r.score, 0);
  const bestScore = Math.min(...validRounds.map((r: any) => r.score));

  const sumToPar = validRounds.reduce((sum: any, r: any) => sum + r.to_par, 0);
  const averageToPar = sumToPar / totalRounds;
  const bestToPar = Math.min(...validRounds.map((r: any) => r.to_par));

  // Calculate handicap
  const handicap = calculateHandicap(validRounds);

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