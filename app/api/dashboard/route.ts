import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { normalizeRoundsByMode, calculateHandicap } from '@/lib/utils/handicap';
import { isPremiumUser } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    const currentUserId = await requireAuth(request);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const statsMode = (searchParams.get('statsMode') || 'combined') as 'combined' | '9' | '18';
    const requestedUserIdParam = searchParams.get('user_id');
    const requestedUserId = requestedUserIdParam ? BigInt(requestedUserIdParam) : currentUserId;
    const dateFilter = searchParams.get('dateFilter') || 'all';

    // Check dashboard visibility
    const profile = await prisma.userProfile.findUnique({
      where: { userId: requestedUserId },
      select: { dashboardVisibility: true },
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

    if (!rounds.length) {
      return successResponse({
        message: 'No rounds found',
        total_rounds: 0,
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
      });
    }

    // Check subscription tier and apply 20-round limit for free users
    const user = await prisma.user.findUnique({
      where: { id: requestedUserId },
      select: { subscriptionTier: true },
    });
    const isPremium = user ? isPremiumUser(user) : false;

    // Free users: limit to last 20 rounds (most recent)
    let roundsToAnalyze = rounds;
    if (!isPremium) {
      // Sort by date descending (most recent first), then take last 20
      const sortedRounds = [...rounds].sort((a, b) => b.date.getTime() - a.date.getTime());
      roundsToAnalyze = sortedRounds.slice(0, 20);
    }

    // Transform rounds to format expected by handicap utils
    const allRounds = roundsToAnalyze.map((r: any) => {
      const firTotal = r.tee.holes.filter((h: any) => h.par !== 3).length;
      const girTotal = r.tee.holes.length;

      return {
        id: Number(r.id),
        date: r.date,
        holes: r.tee.numberOfHoles ?? r.tee.holes.length ?? 18,
        score: r.score ?? 0,
        to_par: r.toPar ?? null,
        fir_hit: r.advancedStats ? r.firHit : null,
        gir_hit: r.advancedStats ? r.girHit : null,
        putts: r.advancedStats ? r.putts : null,
        penalties: r.advancedStats ? r.penalties : null,
        fir_total: firTotal,
        gir_total: girTotal,
        rating: Number(r.tee.courseRating) ?? 72,
        slope: r.tee.slopeRating ?? 113,
        par: r.tee.parTotal ?? 72,
        advanced_stats: r.advancedStats,
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
    const modeRounds = normalizeRoundsByMode(allRounds, statsMode);
    const handicap = calculateHandicap(modeRounds);

    const roundIds = modeRounds.map((r: any) => BigInt(r.id));

    if (roundIds.length === 0) {
      return successResponse({
        message: '',
        total_rounds: 0,
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

    let hbhRoundCount = 0;

    modeRounds.forEach((r: any) => {
      if (!r.hole_by_hole) return;
      const weight = 1;
      const holes = roundHoles.filter((rh: any) => rh.roundId === BigInt(r.id));
      if (!holes.length) return;

      hbhRoundCount += weight;

      holes.forEach((rh: any) => {
        const score = rh.score;
        const par = rh.hole.par;

        if (parBuckets[par]) {
          parBuckets[par].sum += score * weight;
          parBuckets[par].count += weight;
        }

        const diff = score - par;
        if (score === 1) scoring.ace += weight;
        else if (diff <= -3) scoring.albatross += weight;
        else if (diff === -2) scoring.eagle += weight;
        else if (diff === -1) scoring.birdie += weight;
        else if (diff === 0) scoring.par += weight;
        else if (diff === 1) scoring.bogey += weight;
        else scoring.double_plus += weight;
      });
    });

    const hbh_stats = {
      par3_avg: parBuckets[3].count ? parBuckets[3].sum / parBuckets[3].count : null,
      par4_avg: parBuckets[4].count ? parBuckets[4].sum / parBuckets[4].count : null,
      par5_avg: parBuckets[5].count ? parBuckets[5].sum / parBuckets[5].count : null,
      scoring_breakdown: scoring,
      hbh_rounds_count: hbhRoundCount,
    };

    // Calculate aggregate stats
    const totalRounds = modeRounds.length;
    const bestScore = totalRounds ? Math.min(...modeRounds.map(r => r.score)) : null;
    const worstScore = totalRounds ? Math.max(...modeRounds.map(r => r.score)) : null;
    const averageScore = totalRounds ? modeRounds.reduce((s, r) => s + r.score, 0) / totalRounds : null;

    // Calculate toPar stats (only for rounds with to_par values)
    const roundsWithToPar = modeRounds.filter(r => r.to_par !== null && r.to_par !== undefined);
    const bestToPar = roundsWithToPar.length ? Math.min(...roundsWithToPar.map((r: any) => r.to_par!)) : null;
    const worstToPar = roundsWithToPar.length ? Math.max(...roundsWithToPar.map((r: any) => r.to_par!)) : null;
    const averageToPar = roundsWithToPar.length
      ? roundsWithToPar.reduce((s, r) => s + r.to_par!, 0) / roundsWithToPar.length
      : null;

    const firRounds = modeRounds.filter((r: any) => r.fir_hit != null && r.fir_total != null);
    const girRounds = modeRounds.filter((r: any) => r.gir_hit != null && r.gir_total != null);
    const puttsRounds = modeRounds.filter((r: any) => r.putts != null);
    const penaltiesRounds = modeRounds.filter((r: any) => r.penalties != null);

    const fir_avg = firRounds.length
      ? (firRounds.reduce((sum, r) => sum + (r.fir_hit || 0), 0) /
          firRounds.reduce((sum, r) => sum + r.fir_total, 0)) * 100
      : null;

    const gir_avg = girRounds.length
      ? (girRounds.reduce((sum, r) => sum + (r.gir_hit || 0), 0) /
          girRounds.reduce((sum, r) => sum + r.gir_total, 0)) * 100
      : null;

    const avg_putts = puttsRounds.length
      ? puttsRounds.reduce((sum, r) => sum + (r.putts || 0), 0) / puttsRounds.length
      : null;

    const avg_penalties = penaltiesRounds.length
      ? penaltiesRounds.reduce((sum, r) => sum + (r.penalties || 0), 0) / penaltiesRounds.length
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
      all_rounds: modeRounds,
      fir_avg,
      gir_avg,
      avg_putts,
      avg_penalties,
      hbh_stats,
      isPremium,
      limitedToLast20: !isPremium && rounds.length > 20,
      totalRoundsInDb: rounds.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Dashboard error:', error);
    return errorResponse('Database error fetching dashboard', 500);
  }
}
