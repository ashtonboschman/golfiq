import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';

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
          orderBy: [
            { pass: 'asc' },
            { hole: { holeNumber: 'asc' } },
          ] as any,
        },
        roundStrokesGained: true
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
    const formatScoreToPar = (diff: number | null) => {
      if (diff === null) return null;
      if (diff > 0) return `+${diff}`;
      if (diff < 0) return `${diff}`;
      return 'E';
    };

    // Resolve tee context
    const teeSegment = (round.teeSegment ?? 'full') as TeeSegment;
    const ctx = resolveTeeContext(round.tee, teeSegment);

    // Calculate statistics
    const totalPar = ctx.parTotal;
    const scoreToPar = round.toPar ?? null;
    const netToPar = round.netToPar ?? null;
    const scoreToParFormatted = formatScoreToPar(scoreToPar);
    const netToParFormatted = formatScoreToPar(netToPar);

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
      const isPass2 = rh.pass === 2;
      const displayHoleNumber = isPass2 ? hole.holeNumber + 9 : hole.holeNumber;
      const displayHandicap = isPass2 && hole.handicap != null ? hole.handicap + 9 : hole.handicap;
      const scoreDiff = rh.score - hole.par;
      const scoreDiffFormatted = formatScoreToPar(scoreDiff);

      // Update scoring by par breakdown
      if (scoringByPar[hole.par]) {
        scoringByPar[hole.par].holes += 1;
        scoringByPar[hole.par].totalScore += rh.score;
        scoringByPar[hole.par].totalPar += hole.par;
      }

      return {
        hole_number: displayHoleNumber,
        par: hole.par,
        yardage: hole.yardage,
        handicap: displayHandicap,
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
    const totalHoles = ctx.holes;
    const girPercentage = hasAdvancedStats && totalGIR !== null && totalHoles > 0
      ? ((totalGIR / totalHoles) * 100).toFixed(0)
      : null;

    // FIR only applies to par 4s and 5s - use resolved context
    const totalFIRHoles = ctx.nonPar3Holes;
    const firPercentage = hasAdvancedStats && totalFIR !== null && totalFIRHoles > 0
      ? ((totalFIR / totalFIRHoles) * 100).toFixed(0)
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

    const roundOneDecimal = (value: unknown): number | null => {
      if (value == null) return null;
      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) return null;
      return Math.round(asNumber * 10) / 10;
    };

    const sgTotal = roundOneDecimal(round.roundStrokesGained?.sgTotal);
    const sgOffTee = roundOneDecimal(round.roundStrokesGained?.sgOffTee);
    const sgApproach = roundOneDecimal(round.roundStrokesGained?.sgApproach);
    const sgPutting = roundOneDecimal(round.roundStrokesGained?.sgPutting);
    const sgPenalties = roundOneDecimal(round.roundStrokesGained?.sgPenalties);
    const sgResidual = roundOneDecimal(round.roundStrokesGained?.sgResidual);
    const confidence = round.roundStrokesGained?.confidence;
    const messages = round.roundStrokesGained?.messages;

    // Response
    const stats = {
      round_id: round.id.toString(),
      course_name: courseName,
      number_of_holes: ctx.holes,
      tee_name: round.tee.teeName,
      course_rating: ctx.courseRating,
      slope_rating: ctx.slopeRating,
      date: round.date,
      total_score: round.score,
      total_par: totalPar,
      score_to_par: scoreToPar,
      score_to_par_formatted: scoreToParFormatted,
      net_to_par_formatted: netToParFormatted,
      handicap_at_round: round.handicapAtRound !== null ? Number(round.handicapAtRound) : null,

      // Overall stats
      greens_in_regulation: totalGIR,
      gir_percentage: girPercentage,
      total_holes_for_gir: totalHoles,
      fairways_hit: totalFIR,
      fir_percentage: firPercentage,
      total_holes_for_fir: totalFIRHoles,
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

      // Strokes gained results
      sg_total: sgTotal,
      sg_off_tee: sgOffTee,
      sg_approach: sgApproach,
      sg_putting: sgPutting,
      sg_penalties: sgPenalties,
      sg_residual: sgResidual,
      sg_confidence: confidence,
      sg_messages: messages,
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
