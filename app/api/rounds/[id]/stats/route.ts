import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { id } = await context.params;
    const roundId = BigInt(id);

    // Fetch round with all related data
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        course: true,
        tee: {
          include: {
            holes: {
              orderBy: { holeNumber: 'asc' },
            },
          },
        },
        roundHoles: {
          include: {
            hole: true,
          },
          orderBy: {
            hole: {
              holeNumber: 'asc',
            },
          },
        },
      },
    });

    if (!round) {
      return errorResponse('Round not found', 404);
    }

    // Verify ownership
    if (round.userId !== userId) {
      return errorResponse('Unauthorized', 403);
    }

    // Helper to format score to par consistently
    const formatScoreToPar = (diff: number) => {
      if (diff > 0) return `+${diff}`;
      if (diff < 0) return `${diff}`;
      return 'E';
    };

    // Calculate statistics
    const totalPar = round.tee.parTotal || 0;
    const scoreToPar = round.score - totalPar;
    const scoreToParFormatted = formatScoreToPar(scoreToPar);

    // Get totals from Round table (only if advanced stats were tracked)
    const hasAdvancedStats = round.advancedStats;
    const totalGIR = hasAdvancedStats ? (round.girHit ?? null) : null;
    const totalFIR = hasAdvancedStats ? (round.firHit ?? null) : null;
    const totalPutts = hasAdvancedStats ? (round.putts ?? null) : null;
    const totalPenalties = hasAdvancedStats ? (round.penalties ?? null) : null;

    // Scoring breakdown by par
    const scoringByPar: Record<number, { holes: number; totalScore: number; totalPar: number }> = {
      3: { holes: 0, totalScore: 0, totalPar: 0 },
      4: { holes: 0, totalScore: 0, totalPar: 0 },
      5: { holes: 0, totalScore: 0, totalPar: 0 },
    };

    // Hole-by-hole details (only for display purposes - totals come from Round table)
    const holeDetails = round.roundHoles.map((rh: any) => {
      const hole = rh.hole;
      const scoreDiff = rh.score - hole.par;
      const scoreDiffFormatted = formatScoreToPar(scoreDiff);

      // Update scoring by par breakdown
      if (scoringByPar[hole.par]) {
        scoringByPar[hole.par].holes += 1;
        scoringByPar[hole.par].totalScore += rh.score;
        scoringByPar[hole.par].totalPar += hole.par;
      }

      return {
        hole_number: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage,
        handicap: hole.handicap,
        score: rh.score,
        score_to_par: scoreDiff,
        score_to_par_formatted: scoreDiffFormatted,
        gir_hit: rh.girHit,
        fir_hit: rh.firHit,
        putts: rh.putts,
        penalties: rh.penalties,
      };
    });

    // Calculate percentages (only if advanced stats were tracked)
    // Use the tee's hole count for totals
    const totalHoles = round.tee.holes?.length || 0;
    const girPercentage = hasAdvancedStats && totalGIR !== null && totalHoles > 0
      ? ((totalGIR / totalHoles) * 100).toFixed(1)
      : null;

    // FIR only applies to par 4s and 5s - count from tee holes
    const parFourFiveHoles = round.tee.holes?.filter((h: any) => h.par === 4 || h.par === 5).length || 0;
    const firPercentage = hasAdvancedStats && totalFIR !== null && parFourFiveHoles > 0
      ? ((totalFIR / parFourFiveHoles) * 100).toFixed(1)
      : null;

    const puttsPerHole = hasAdvancedStats && totalPutts !== null && totalHoles > 0
      ? (totalPutts / totalHoles).toFixed(2)
      : null;

    // Build scoring breakdown
    const scoringBreakdown = Object.entries(scoringByPar)
      .filter(([_, data]) => data.holes > 0)
      .map(([par, data]) => ({
        par: Number(par),
        holes: data.holes,
        total_score: data.totalScore,
        total_par: data.totalPar,
        average_score: (data.totalScore / data.holes).toFixed(2),
        score_to_par: data.totalScore - data.totalPar,
      }));

    // Format course name intelligently
    const courseName = round.course.clubName === round.course.courseName
      ? round.course.courseName
      : `${round.course.clubName} - ${round.course.courseName}`;

    // Response
    const stats = {
      round_id: round.id.toString(),
      course_name: courseName,
      tee_name: round.tee.teeName,
      date: round.date,
      total_score: round.score,
      total_par: totalPar,
      score_to_par: scoreToPar,
      score_to_par_formatted: scoreToParFormatted,

      // Overall stats
      greens_in_regulation: totalGIR,
      gir_percentage: girPercentage,
      total_holes_for_gir: totalHoles,
      fairways_hit: totalFIR,
      fir_percentage: firPercentage,
      total_holes_for_fir: parFourFiveHoles,
      total_putts: totalPutts,
      putts_per_hole: puttsPerHole,
      total_penalties: totalPenalties,

      // Breakdown
      scoring_by_par: scoringBreakdown,
      hole_details: holeDetails,

      // Additional round info
      notes: round.notes,
      hole_by_hole: round.holeByHole,
      advanced_stats: round.advancedStats,
    };

    return successResponse({ stats });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('Get round stats error:', error);
    return errorResponse('Failed to retrieve round statistics', 500);
  }
}
