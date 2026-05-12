import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { normalizeRoundsByMode, calculateHandicap } from '@/lib/utils/handicap';
import { isPremiumUser } from '@/lib/subscription';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { buildDashboardOverallInsightsSummary } from '@/lib/insights/dashboardFocus';

const MISS_DIRECTION_KEYS = ['miss_left', 'miss_right', 'miss_short', 'miss_long'] as const;
type MissDirectionKey = (typeof MISS_DIRECTION_KEYS)[number];

function emptyDirectionCounts(): Record<MissDirectionKey, number> {
  return {
    miss_left: 0,
    miss_right: 0,
    miss_short: 0,
    miss_long: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const currentUserId = await requireAuth(request);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const statsModeParam = searchParams.get('statsMode') || 'combined';
    const statsMode: 'combined' | '9' | '18' =
      statsModeParam === '9' || statsModeParam === '18' || statsModeParam === 'combined'
        ? statsModeParam
        : 'combined';

    const requestedUserIdParam = searchParams.get('user_id');
    let requestedUserId = currentUserId;
    if (requestedUserIdParam) {
      if (!/^\d+$/.test(requestedUserIdParam.trim())) {
        return errorResponse('Invalid user_id', 400);
      }
      requestedUserId = BigInt(requestedUserIdParam.trim());
    }

    const dateFilterParam = searchParams.get('dateFilter') || 'all';
    const dateFilter =
      dateFilterParam === 'all' ||
      dateFilterParam === '30days' ||
      dateFilterParam === '30' ||
      dateFilterParam === '6months' ||
      dateFilterParam === '90' ||
      dateFilterParam === 'year' ||
      dateFilterParam === '365'
        ? dateFilterParam
        : 'all';
    const scoringProfileNormalization =
      statsMode === 'combined'
        ? 'combined_18_equivalent'
        : statsMode === '9'
          ? 'nine_hole'
          : 'eighteen_hole';
    const emptyScoringProfile = {
      normalized_counts: {
        birdie_plus: 0,
        par: 0,
        bogey: 0,
        double_plus: 0,
      },
      normalized_total_holes: 0,
      percentages: {
        birdie_plus: 0,
        par: 0,
        bogey: 0,
        double_plus: 0,
      },
      averages_per_round: {
        birdie_plus: 0,
        par: 0,
        bogey: 0,
        double_plus: 0,
      },
      source_round_count: 0,
      normalization: scoringProfileNormalization,
    };

    // Check dashboard visibility and get user info
    const profile = await prisma.userProfile.findUnique({
      where: { userId: requestedUserId },
      select: {
        dashboardVisibility: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!profile) {
      return errorResponse('User not found', 404);
    }

    const visibility = profile.dashboardVisibility;

    // Check permissions if viewing someone else's dashboard
    if (requestedUserId !== currentUserId) {
      if (visibility === 'private') {
        return errorResponse('Dashboard is private', 403);
      } else if (visibility === 'friends') {
        // Check if friends
        const friendship = await prisma.friend.findFirst({
          where: {
            OR: [
              { userId: currentUserId, friendId: requestedUserId },
              { userId: requestedUserId, friendId: currentUserId },
            ],
          },
        });

        if (!friendship) {
          return errorResponse('Dashboard is visible to friends only', 403);
        }
      }
    }

    // Calculate date filter
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    const now = new Date();

    switch (dateFilter) {
      case 'year':
      case '365':
        // Previous calendar year (Jan 1 - Dec 31 of last year)
        dateFrom = new Date(now.getFullYear() - 1, 0, 1);
        dateTo = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      case '6months':
      case '90':
        dateFrom = new Date(now);
        dateFrom.setMonth(now.getMonth() - 3); // Last 90 days (~3 months)
        break;
      case '30days':
      case '30':
        dateFrom = new Date(now);
        dateFrom.setDate(now.getDate() - 30);
        break;
      case 'all':
      default:
        dateFrom = undefined;
        break;
    }

    // Fetch all rounds with course, tee, and location data
    const rounds = await prisma.round.findMany({
      where: {
        userId: requestedUserId,
        roundContext: 'real',
        ...(dateFrom && dateTo && { date: { gte: dateFrom, lte: dateTo } }),
        ...(dateFrom && !dateTo && { date: { gte: dateFrom } }),
      },
      include: {
        course: {
          include: {
            location: true,
          },
        },
        tee: {
          include: {
            holes: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    const overallInsightModel = (prisma as any).overallInsight;
    const storedOverallInsights = overallInsightModel
      ? await overallInsightModel.findUnique({
          where: { userId: requestedUserId },
          select: { insights: true },
        })
      : null;
    const overallInsightsSummary = buildDashboardOverallInsightsSummary(
      storedOverallInsights?.insights ?? null,
      statsMode,
    );

    if (!rounds.length) {
      return successResponse({
        message: 'No rounds found',
        total_rounds: 0,
        totalRoundsInDb: 0,
        best_score: null,
        worst_score: null,
        average_score: null,
        best_to_par: null,
        worst_to_par: null,
        average_to_par: null,
        avg_putts: null,
        avg_penalties: null,
        fir_avg: null,
        gir_avg: null,
        handicap: null,
        all_rounds: [],
        hbh_stats: null,
        scoring_profile: emptyScoringProfile,
        miss_tendencies: null,
        overallInsightsSummary,
        latestRoundUpdatedAt: null,
      });
    }

    // Check subscription tier and apply 20-round limit for free users
    const user = await prisma.user.findUnique({
      where: { id: requestedUserId },
      select: { subscriptionTier: true },
    });
    const isPremium = user ? isPremiumUser(user) : false;

    // Transform rounds to format expected by handicap utils via resolveTeeContext
    const allRoundsUncapped = rounds.map((r: any) => {
      const teeSegment = (r.teeSegment ?? 'full') as TeeSegment;
      const ctx = resolveTeeContext(r.tee, teeSegment);
      const to_par = r.toPar ?? (r.score ? r.score - ctx.parTotal : null);

      return {
        id: Number(r.id),
        date: r.date,
        holes: ctx.holes,
        number_of_holes: ctx.holes,
        score: r.score ?? 0,
        net_score: r.netScore,
        to_par,
        fir_hit: r.firHit,
        gir_hit: r.girHit,
        putts: r.putts,
        penalties: r.penalties,
        fir_total: ctx.nonPar3Holes,
        gir_total: ctx.holes,
        rating: ctx.courseRating,
        slope: ctx.slopeRating,
        par: ctx.parTotal,
        hole_by_hole: r.holeByHole,
        tee: {
          tee_id: Number(r.teeId),
          tee_name: r.tee.teeName ?? '-',
        },
        course: {
          club_name: r.course.clubName ?? '-',
          course_name: r.course.courseName ?? '-',
          city: r.course.location?.city ?? '-',
          state: r.course.location?.state ?? '-',
          address: r.course.location?.address ?? '-',
        },
      };
    });

    // Normalize rounds by mode
    const modeRoundsUncapped = normalizeRoundsByMode(allRoundsUncapped, statsMode);
    const sourceRoundHolesByRoundId = allRoundsUncapped.reduce((acc, round: any) => {
      acc.set(String(round.id), round.holes);
      return acc;
    }, new Map<string, number>());
    const totalRounds = modeRoundsUncapped.length;
    const latestRoundUpdatedAt =
      rounds.length > 0
        ? rounds.reduce((latest: Date, round: any) => {
            const updatedAt = round.updatedAt instanceof Date ? round.updatedAt : new Date(round.updatedAt);
            return updatedAt > latest ? updatedAt : latest;
          }, new Date(0)).toISOString()
        : null;

     // Free users: limit to last 20 rounds (most recent)
    let roundsForStats = modeRoundsUncapped;
    if (!isPremium) {
      roundsForStats = [...modeRoundsUncapped]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 20);
    }

    const handicap = calculateHandicap(roundsForStats);

    const roundIds = roundsForStats.map((r: any) => BigInt(r.id));

    if (roundIds.length === 0) {
      return successResponse({
        message: '',
        total_rounds: 0,
        totalRoundsInDb: rounds.length,
        best_score: null,
        worst_score: null,
        average_score: null,
        best_to_par: null,
        worst_to_par: null,
        average_to_par: null,
        handicap,
        all_rounds: [],
        fir_avg: null,
        gir_avg: null,
        avg_putts: null,
        avg_penalties: null,
        miss_tendencies: null,
        hbh_stats: {
          par3_avg: null,
          par4_avg: null,
          par5_avg: null,
          scoring_breakdown: {
            ace: 0,
            albatross: 0,
            eagle: 0,
            birdie: 0,
            par: 0,
            bogey: 0,
            double_plus: 0,
          },
          hbh_rounds_count: 0,
        },
        scoring_profile: emptyScoringProfile,
      });
    }

    // Fetch hole-by-hole data
    const roundHoles = await prisma.roundHole.findMany({
      where: {
        roundId: { in: roundIds },
      },
      include: {
        hole: {
          select: {
            par: true,
          },
        },
      },
    });
    const roundHolesByRoundId = roundHoles.reduce((acc, hole: any) => {
      const key = hole.roundId.toString();
      const existing = acc.get(key);
      if (existing) {
        existing.push(hole);
      } else {
        acc.set(key, [hole]);
      }
      return acc;
    }, new Map<string, any[]>());

    // Calculate hole-by-hole stats
    const parBuckets: Record<number, { sum: number; count: number }> = {
      3: { sum: 0, count: 0 },
      4: { sum: 0, count: 0 },
      5: { sum: 0, count: 0 },
    };

    const scoring = {
      ace: 0,
      albatross: 0,
      eagle: 0,
      birdie: 0,
      par: 0,
      bogey: 0,
      double_plus: 0,
    };
    const normalizedScoringCounts = {
      birdie_plus: 0,
      par: 0,
      bogey: 0,
      double_plus: 0,
    };
    let normalizedTotalHoles = 0;
    let scoringProfileRoundCount = 0;

    let hbhRoundCount = 0;

    roundsForStats.forEach((r: any) => {
      if (!r.hole_by_hole) return;
      const roundKey = String(r.id);
      const holes = roundHolesByRoundId.get(roundKey) ?? [];
      if (!holes.length) return;

      hbhRoundCount += 1;
      scoringProfileRoundCount += 1;
      const sourceHoles = sourceRoundHolesByRoundId.get(roundKey) ?? r.holes;
      const normalizationMultiplier =
        statsMode === 'combined' && sourceHoles === 9 ? 2 : 1;
      const roundBucketCounts = {
        birdie_plus: 0,
        par: 0,
        bogey: 0,
        double_plus: 0,
      };

      holes.forEach((rh: any) => {
        const score = rh.score;
        const par = rh.hole.par;

        if (parBuckets[par]) {
          parBuckets[par].sum += score;
          parBuckets[par].count += 1;
        }

        const diff = score - par;
        if (score === 1) {
          scoring.ace += 1;
          roundBucketCounts.birdie_plus += 1;
        } else if (diff <= -3) {
          scoring.albatross += 1;
          roundBucketCounts.birdie_plus += 1;
        } else if (diff === -2) {
          scoring.eagle += 1;
          roundBucketCounts.birdie_plus += 1;
        } else if (diff === -1) {
          scoring.birdie += 1;
          roundBucketCounts.birdie_plus += 1;
        } else if (diff === 0) {
          scoring.par += 1;
          roundBucketCounts.par += 1;
        } else if (diff === 1) {
          scoring.bogey += 1;
          roundBucketCounts.bogey += 1;
        } else {
          scoring.double_plus += 1;
          roundBucketCounts.double_plus += 1;
        }
      });

      normalizedScoringCounts.birdie_plus +=
        roundBucketCounts.birdie_plus * normalizationMultiplier;
      normalizedScoringCounts.par +=
        roundBucketCounts.par * normalizationMultiplier;
      normalizedScoringCounts.bogey +=
        roundBucketCounts.bogey * normalizationMultiplier;
      normalizedScoringCounts.double_plus +=
        roundBucketCounts.double_plus * normalizationMultiplier;
      normalizedTotalHoles += holes.length * normalizationMultiplier;
    });

    const toPercent = (count: number, total: number): number => {
      if (!Number.isFinite(total) || total <= 0) return 0;
      return Number(((count / total) * 100).toFixed(2));
    };
    const toAveragePerRound = (count: number, rounds: number): number => {
      if (!Number.isFinite(rounds) || rounds <= 0) return 0;
      return Number((count / rounds).toFixed(2));
    };
    const scoring_profile = {
      normalized_counts: normalizedScoringCounts,
      normalized_total_holes: normalizedTotalHoles,
      percentages: {
        birdie_plus: toPercent(normalizedScoringCounts.birdie_plus, normalizedTotalHoles),
        par: toPercent(normalizedScoringCounts.par, normalizedTotalHoles),
        bogey: toPercent(normalizedScoringCounts.bogey, normalizedTotalHoles),
        double_plus: toPercent(normalizedScoringCounts.double_plus, normalizedTotalHoles),
      },
      averages_per_round: {
        birdie_plus: toAveragePerRound(normalizedScoringCounts.birdie_plus, scoringProfileRoundCount),
        par: toAveragePerRound(normalizedScoringCounts.par, scoringProfileRoundCount),
        bogey: toAveragePerRound(normalizedScoringCounts.bogey, scoringProfileRoundCount),
        double_plus: toAveragePerRound(normalizedScoringCounts.double_plus, scoringProfileRoundCount),
      },
      source_round_count: scoringProfileRoundCount,
      normalization: scoringProfileNormalization,
    };

    const hbh_stats = {
      par3_avg: parBuckets[3].count ? parBuckets[3].sum / parBuckets[3].count : null,
      par4_avg: parBuckets[4].count ? parBuckets[4].sum / parBuckets[4].count : null,
      par5_avg: parBuckets[5].count ? parBuckets[5].sum / parBuckets[5].count : null,
      scoring_breakdown: scoring,
      hbh_rounds_count: hbhRoundCount,
    };

    const firDirectionCounts = emptyDirectionCounts();
    const girDirectionCounts = emptyDirectionCounts();
    let firTotalMisses = 0;
    let girTotalMisses = 0;

    roundHoles.forEach((rh: any) => {
      if (rh.firHit === 0) firTotalMisses += 1;
      if (rh.girHit === 0) girTotalMisses += 1;

      if (rh.firDirection && MISS_DIRECTION_KEYS.includes(rh.firDirection)) {
        firDirectionCounts[rh.firDirection as MissDirectionKey] += 1;
      }
      if (rh.girDirection && MISS_DIRECTION_KEYS.includes(rh.girDirection)) {
        girDirectionCounts[rh.girDirection as MissDirectionKey] += 1;
      }
    });

    const firTrackedMisses = MISS_DIRECTION_KEYS.reduce((sum, key) => sum + firDirectionCounts[key], 0);
    const girTrackedMisses = MISS_DIRECTION_KEYS.reduce((sum, key) => sum + girDirectionCounts[key], 0);
    const missLabels: Record<MissDirectionKey, string> = {
      miss_left: 'Left',
      miss_right: 'Right',
      miss_short: 'Short',
      miss_long: 'Long',
    };
    const miss_tendencies = {
      labels: MISS_DIRECTION_KEYS.map((key) => missLabels[key]),
      keys: [...MISS_DIRECTION_KEYS],
      fir: {
        percentages: MISS_DIRECTION_KEYS.map((key) =>
          firTrackedMisses > 0 ? (firDirectionCounts[key] / firTrackedMisses) * 100 : null,
        ),
        counts: MISS_DIRECTION_KEYS.map((key) => firDirectionCounts[key]),
        tracked_misses: firTrackedMisses,
        total_misses: firTotalMisses,
        untracked_misses: Math.max(0, firTotalMisses - firTrackedMisses),
      },
      gir: {
        percentages: MISS_DIRECTION_KEYS.map((key) =>
          girTrackedMisses > 0 ? (girDirectionCounts[key] / girTrackedMisses) * 100 : null,
        ),
        counts: MISS_DIRECTION_KEYS.map((key) => girDirectionCounts[key]),
        tracked_misses: girTrackedMisses,
        total_misses: girTotalMisses,
        untracked_misses: Math.max(0, girTotalMisses - girTrackedMisses),
      },
    };

    // Calculate aggregate stats based on the same capped set used for free-tier stats.
    const statsRoundsCount = roundsForStats.length;
    const bestScore = statsRoundsCount ? Math.min(...roundsForStats.map((r: any) => r.score)) : null;
    const worstScore = statsRoundsCount ? Math.max(...roundsForStats.map((r: any) => r.score)) : null;
    const averageScore = statsRoundsCount
      ? roundsForStats.reduce((s: any, r: any) => s + r.score, 0) / statsRoundsCount
      : null;

    // Calculate to_par stats (only for rounds with to_par values)
    const roundsWithToPar = (roundsForStats as any[]).filter((r: any) => r.to_par !== null && r.to_par !== undefined);
    const bestToPar = roundsWithToPar.length ? Math.min(...roundsWithToPar.map((r: any) => r.to_par!)) : null;
    const worstToPar = roundsWithToPar.length ? Math.max(...roundsWithToPar.map((r: any) => r.to_par!)) : null;
    const averageToPar = roundsWithToPar.length
      ? roundsWithToPar.reduce((s: any, r: any) => s + r.to_par!, 0) / roundsWithToPar.length
      : null;

    const firRounds = roundsForStats.filter((r: any) => r.fir_hit != null && r.fir_total != null);
    const girRounds = roundsForStats.filter((r: any) => r.gir_hit != null && r.gir_total != null);
    const puttsRounds = roundsForStats.filter((r: any) => r.putts != null);
    const penaltiesRounds = roundsForStats.filter((r: any) => r.penalties != null);

    const fir_avg = firRounds.length
      ? (firRounds.reduce((sum: any, r: any) => sum + (r.fir_hit || 0), 0) /
          firRounds.reduce((sum: any, r: any) => sum + r.fir_total, 0)) * 100
      : null;

    const gir_avg = girRounds.length
      ? (girRounds.reduce((sum: any, r: any) => sum + (r.gir_hit || 0), 0) /
          girRounds.reduce((sum: any, r: any) => sum + r.gir_total, 0)) * 100
      : null;

    const avg_putts = puttsRounds.length
      ? puttsRounds.reduce((sum: any, r: any) => sum + (r.putts || 0), 0) / puttsRounds.length
      : null;

    const avg_penalties = penaltiesRounds.length
      ? penaltiesRounds.reduce((sum: any, r: any) => sum + (r.penalties || 0), 0) / penaltiesRounds.length
      : null;

    return successResponse({
      message: '',
      total_rounds: totalRounds,
      best_score: bestScore,
      worst_score: worstScore,
      average_score: averageScore,
      best_to_par: bestToPar,
      worst_to_par: worstToPar,
      average_to_par: averageToPar,
      handicap,
      all_rounds: roundsForStats,
      fir_avg,
      gir_avg,
      avg_putts,
      avg_penalties,
      hbh_stats,
      scoring_profile,
      miss_tendencies,
      isPremium,
      limitedToLast20: !isPremium && rounds.length > 20,
      totalRoundsInDb: rounds.length,
      user: {
        first_name: profile.firstName,
        last_name: profile.lastName,
      },
      overallInsightsSummary,
      latestRoundUpdatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Dashboard error:', error);
    return errorResponse('Database error fetching dashboard', 500);
  }
}
