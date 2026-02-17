import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { recalcLeaderboard } from '@/lib/utils/leaderboard';
import { calculateNetScore } from '@/lib/utils/handicap';
import { calculateStrokesGained } from '@/lib/utils/strokesGained';
import { generateInsights } from '@/app/api/rounds/[id]/insights/route';
import { generateAndStoreOverallInsights } from '@/app/api/insights/overall/route';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { z } from 'zod';

// Helper to format round data
type RoundWithRelations = {
  id: bigint;
  userId: bigint;
  courseId: bigint;
  teeId: bigint;
  holeByHole: boolean;
  advancedStats: boolean;
  holesPlayed: number;
  toPar: number | null;
  teeSegment: string;
  date: Date;
  score: number;
  netScore: number | null;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  course: {
    courseName: string;
    clubName: string;
    location: {
      city: string | null;
      state: string | null;
      address: string | null;
    } | null;
  };
  tee: {
    teeName: string;
    gender: string;
    parTotal: number | null;
    numberOfHoles: number | null;
  };
};

function formatRoundRow(round: RoundWithRelations) {
  return {
    id: Number(round.id),
    user_id: Number(round.userId),
    course_id: Number(round.courseId),
    tee_id: Number(round.teeId),
    hole_by_hole: round.holeByHole ? 1 : 0,
    advanced_stats: round.advancedStats ? 1 : 0,
    date: round.date,
    score: round.score === null ? null : Number(round.score),
    fir_hit: round.firHit === null ? null : Number(round.firHit),
    gir_hit: round.girHit === null ? null : Number(round.girHit),
    putts: round.putts === null ? null : Number(round.putts),
    penalties: round.penalties === null ? null : Number(round.penalties),
    notes: round.notes,
    created_at: round.createdAt,
    updated_at: round.updatedAt,
    course: {
      id: Number(round.courseId),
      course_name: round.course?.courseName || null,
      club_name: round.course?.clubName || null,
    },
    tee: {
      id: Number(round.teeId),
      tee_name: round.tee?.teeName || null,
      gender: round.tee?.gender || null,
      par_total: (round.toPar !== null && round.score !== null)
        ? round.score - round.toPar
        : round.tee?.parTotal ?? null,
      number_of_holes: round.holesPlayed ?? round.tee?.numberOfHoles ?? null,
    },
    location: {
      city: round.course?.location?.city || '-',
      state: round.course?.location?.state || null,
      address: round.course?.location?.address || null,
    },
  };
}

// GET single round
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const roundId = BigInt(id);

    const round = await prisma.round.findFirst({
      where: {
        id: roundId,
        userId,
      },
      include: {
        course: {
          include: {
            location: true,
          },
        },
        tee: true,
      },
    });

    if (!round) {
      return errorResponse('Round not found', 404);
    }

    const formatted = formatRoundRow(round);

    // Include hole-by-hole data and tee_segment if applicable
    const response: ReturnType<typeof formatRoundRow> & { tee_segment: string; round_holes: Array<{
      hole_id: number;
      pass: number;
      score: number | null;
      fir_hit: number | null;
      gir_hit: number | null;
      putts: number | null;
      penalties: number | null;
    }> } = {
      ...formatted,
      tee_segment: (round as any).teeSegment ?? 'full',
      round_holes: [],
    };

    if (round.holeByHole) {
      const holes = await prisma.roundHole.findMany({
        where: { roundId },
        orderBy: [{ pass: 'asc' }, { holeId: 'asc' }],
      });

      response.round_holes = holes.map((h: any) => ({
        hole_id: Number(h.holeId),
        pass: h.pass,
        score: h.score,
        fir_hit: h.firHit,
        gir_hit: h.girHit,
        putts: h.putts,
        penalties: h.penalties,
      }));
    }

    return successResponse({ round: response });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/rounds/:id error:', error);
    return errorResponse('Database error', 500);
  }
}

// UPDATE round
const updateRoundSchema = z.object({
  course_id: z.union([z.string(), z.number()]).refine((val: any) => {
    const num = typeof val === 'string' ? Number(val) : val;
    return !isNaN(num) && num > 0;
  }, { message: 'course_id must be a valid positive number' }),
  tee_id: z.union([z.string(), z.number()]).refine((val: any) => {
    const num = typeof val === 'string' ? Number(val) : val;
    return !isNaN(num) && num > 0;
  }, { message: 'tee_id must be a valid positive number' }),
  date: z.string().min(1, 'date is required'),
  score: z.number().nullable().optional(),
  fir_hit: z.number().nullable().optional(),
  gir_hit: z.number().nullable().optional(),
  putts: z.number().nullable().optional(),
  penalties: z.number().nullable().optional(),
  notes: z.string().optional().default(''),
  tee_segment: z.enum(['full', 'front9', 'back9', 'double9']).optional().default('full'),
  hole_by_hole: z.union([z.boolean(), z.number()]).transform((val: any) => typeof val === 'number' ? val === 1 : val).optional().default(false),
  advanced_stats: z.union([z.boolean(), z.number()]).transform((val: any) => typeof val === 'number' ? val === 1 : val).optional().default(false),
  round_holes: z.array(z.object({
    hole_id: z.union([z.string(), z.number()]),
    pass: z.number().optional().default(1),
    score: z.number().nullable(),
    fir_hit: z.number().nullable().optional(),
    gir_hit: z.number().nullable().optional(),
    putts: z.number().nullable().optional(),
    penalties: z.number().nullable().optional(),
  })).optional().default([]),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const roundId = BigInt(id);
    const body = await request.json();

    // Validate body
    const result = updateRoundSchema.safeParse(body);
    if (!result.success) {
      return errorResponse(result.error.issues[0]?.message || 'Validation failed', 400);
    }
    const data = result.data;
    const courseId = BigInt(data.course_id);
    const teeId = BigInt(data.tee_id);

    // Quick score requires score
    if (!data.hole_by_hole && (data.score === null || data.score === undefined)) {
      return errorResponse('Score is required in Quick Score mode', 400);
    }

    const updateScore = data.hole_by_hole ? 0 : data.score!;
    const updateFir = !data.hole_by_hole && data.advanced_stats ? data.fir_hit ?? null : null;
    const updateGir = !data.hole_by_hole && data.advanced_stats ? data.gir_hit ?? null : null;
    const updatePutts = !data.hole_by_hole && data.advanced_stats ? data.putts ?? null : null;
    const updatePenalties = !data.hole_by_hole && data.advanced_stats ? data.penalties ?? null : null;

    // Fetch existing round to preserve time.
    const existingRound = await prisma.round.findFirst({
      where: { id: roundId, userId },
      select: { date: true },
    });
    if (!existingRound) return errorResponse('Round not found or not authorized', 404);

    const [year, month, day] = data.date.split('-').map(Number);
    const existingDate = new Date(existingRound.date);
    const updatedAt = new Date(Date.UTC(
      year,
      month - 1,
      day,
      existingDate.getUTCHours(),
      existingDate.getUTCMinutes(),
      existingDate.getUTCSeconds(),
      existingDate.getUTCMilliseconds()
    ));

    // Fetch tee for resolveTeeContext
    const teeForCtx = await prisma.tee.findUnique({
      where: { id: teeId },
      include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } },
    });
    if (!teeForCtx) return errorResponse('Tee not found', 404);

    const teeSegment = data.tee_segment as TeeSegment;
    const ctx = resolveTeeContext(teeForCtx, teeSegment);

    // Update round (initial update without netScore/netToPar)
    await prisma.round.update({
      where: { id: roundId },
      data: {
        courseId,
        teeId,
        teeSegment,
        holesPlayed: ctx.holes,
        date: updatedAt,
        holeByHole: data.hole_by_hole,
        advancedStats: data.advanced_stats,
        score: updateScore,
        firHit: updateFir,
        girHit: updateGir,
        putts: updatePutts,
        penalties: updatePenalties,
        notes: data.notes ?? null,
      },
    });

    if (!data.hole_by_hole) {
      const toPar = updateScore - ctx.parTotal;
      await prisma.round.update({
        where: { id: roundId },
        data: { toPar },
      });
    }

    // Handle hole-by-hole data
    if (data.hole_by_hole && data.round_holes) {
      // Delete existing holes
      await prisma.roundHole.deleteMany({ where: { roundId } });

      // Create new holes
      if (data.round_holes.length) {
        await prisma.roundHole.createMany({
          data: data.round_holes.map(h => ({
            roundId,
            holeId: BigInt(h.hole_id),
            pass: h.pass ?? 1,
            score: h.score ?? 0,
            firHit: data.advanced_stats ? h.fir_hit ?? null : null,
            girHit: data.advanced_stats ? h.gir_hit ?? null : null,
            putts: data.advanced_stats ? h.putts ?? null : null,
            penalties: data.advanced_stats ? h.penalties ?? null : null,
          })),
        });
      }

      // Recalculate totals for hole-by-hole rounds
      await recalcRoundTotals(roundId, data.advanced_stats);
    }

    // Fetch updated round totals (after recalcRoundTotals if hole-by-hole)
    const updatedRound = await prisma.round.findUnique({
      where: { id: roundId },
      select: { score: true, teeId: true, handicapAtRound: true },
    });

    // Recalculate netScore/netToPar using handicapAtRound and resolved tee context
    if (updatedRound?.score !== null) {
      const netResult = calculateNetScore(
        Number(updatedRound?.score),
        updatedRound?.handicapAtRound !== null && updatedRound?.handicapAtRound !== undefined
          ? Number(updatedRound.handicapAtRound) : null,
        ctx
      );

      await prisma.round.update({
        where: { id: roundId },
        data: { netScore: netResult.netScore, netToPar: netResult.netToPar },
      });
    }

    // Calculate strokes gained
    const sg = await calculateStrokesGained({ userId, roundId }, prisma);
    const updatedSG = await prisma.roundStrokesGained.updateMany({
      where: { roundId },
      data: {
        sgTotal: sg.sgTotal,
        sgOffTee: sg.sgOffTee,
        sgApproach: sg.sgApproach,
        sgPutting: sg.sgPutting,
        sgPenalties: sg.sgPenalties,
        sgResidual: sg.sgResidual,
        confidence: sg.confidence,
        messages: sg.messages,
      },
    });
    if (updatedSG.count === 0) {
      await prisma.roundStrokesGained.create({ data: { roundId, userId, ...sg } });
    }

    // Recalculate leaderboard
    await recalcLeaderboard(userId);

    // Always regenerate insights after a round update.
    // Await here so edits reliably reflect the latest Message 3 policy/data on next view.
    await prisma.roundInsight.deleteMany({ where: { roundId } });
    await triggerInsightsGeneration(roundId, userId, true);
    await triggerOverallInsightsGeneration(userId);

    return successResponse({ message: 'Round updated' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('PUT /api/rounds/:id error:', error);
    return errorResponse('Database error', 500);
  }
}

// DELETE round
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const roundId = BigInt(id);

    // Delete round holes first (cascade should handle this but being explicit)
    await prisma.roundHole.deleteMany({
      where: { roundId },
    });

    // Delete round
    const result = await prisma.round.deleteMany({
      where: {
        id: roundId,
        userId,
      },
    });

    if (result.count === 0) {
      return errorResponse('Round not found or not authorized', 404);
    }

    // Update leaderboard
    await recalcLeaderboard(userId);
    await triggerOverallInsightsGeneration(userId);

    return successResponse({ message: 'Round deleted' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('DELETE /api/rounds/:id error:', error);
    return errorResponse('Database error', 500);
  }
}

// Helper to recalculate round totals
async function recalcRoundTotals(roundId: bigint, advancedStats: boolean): Promise<void> {
  const holes = await prisma.roundHole.findMany({
    where: { roundId },
    select: {
      score: true,
      firHit: true,
      girHit: true,
      putts: true,
      penalties: true,
    },
  });

  if (!holes.length) return;

  const totalScore = holes.reduce((sum: any, h: any) => sum + h.score, 0);

  // Get round's tee to calculate toPar via resolveTeeContext
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      teeSegment: true,
      tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } },
    },
  });

  const segment = (round?.teeSegment ?? 'full') as TeeSegment;
  const teeCtx = round?.tee ? resolveTeeContext(round.tee, segment) : null;
  const toPar = teeCtx ? totalScore - teeCtx.parTotal : null;

  const totals: {
    score: number;
    toPar: number | null;
    firHit: number | null;
    girHit: number | null;
    putts: number | null;
    penalties: number | null;
  } = {
    score: totalScore,
    toPar,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
  };

  if (advancedStats) {
    const sumField = (field: keyof typeof holes[0]) => {
      const values = holes.map((h: any) => h[field]).filter((v: any): v is number => v !== null);
      return values.length ? values.reduce((a: any, b: any) => a + b, 0) : null;
    };

    totals.firHit = sumField('firHit');
    totals.girHit = sumField('girHit');
    totals.putts = sumField('putts');
    totals.penalties = sumField('penalties');
  }

  await prisma.round.update({
    where: { id: roundId },
    data: totals,
  });
}

// Helper to trigger post-round insights generation for edited rounds.
async function triggerInsightsGeneration(roundId: bigint, userId: bigint, forceRegenerate = false): Promise<void> {
  try {
    await generateInsights(roundId, userId, undefined, { forceRegenerate });
  } catch (error) {
    // Silently fail - insights can be generated later if needed
    console.error('Failed to generate insights:', error);
  }
}

async function triggerOverallInsightsGeneration(userId: bigint): Promise<void> {
  try {
    await generateAndStoreOverallInsights(userId, false);
  } catch (error) {
    // Silently fail - overall insights can be generated on next /insights fetch.
    console.error('Failed to generate overall insights:', error);
  }
}
