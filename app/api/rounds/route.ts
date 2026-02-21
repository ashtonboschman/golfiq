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
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';

// Helper to format round data
type RoundWithRelations = {
  id: bigint;
  userId: bigint;
  courseId: bigint;
  teeId: bigint;
  holeByHole: boolean;
  holesPlayed: number;
  toPar: number | null;
  teeSegment: string;
  date: Date;
  score: number;
  netScore: number | null,
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
    date: round.date,
    score: round.score === null ? null : Number(round.score),
    net_score: round.netScore === null ? null : Number(round.netScore),
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

// GET all rounds
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    // Build where clause with search filter
    const where: any = { userId };
    if (search) {
      where.OR = [
        {
          course: {
            OR: [
              { clubName: { contains: search, mode: 'insensitive' } },
              { courseName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
        {
          course: {
            location: {
              city: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const rounds = await prisma.round.findMany({
      where,
      include: {
        course: {
          include: {
            location: true,
          },
        },
        tee: true,
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      skip,
    });

    const formatted = rounds.map(formatRoundRow);

    return successResponse({ rounds: formatted });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/rounds error:', error);
    return errorResponse('Database error', 500);
  }
}

// CREATE round
const createRoundSchema = z.object({
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

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const result = createRoundSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      await captureServerEvent({
        event: ANALYTICS_EVENTS.apiRequestFailed,
        distinctId: userId.toString(),
        properties: {
          endpoint: '/api/rounds',
          method: 'POST',
          status_code: 400,
          failure_stage: 'validation',
          error_code: 'validation_failed',
        },
        context: { request, sourcePage: '/api/rounds' },
      });
      return errorResponse(firstError?.message || 'Validation failed', 400);
    }

    const data = result.data;
    const courseId = BigInt(data.course_id);
    const teeId = BigInt(data.tee_id);

    // Validate score is provided for After Round mode
    if (!data.hole_by_hole && (data.score === null || data.score === undefined)) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.apiRequestFailed,
        distinctId: userId.toString(),
        properties: {
          endpoint: '/api/rounds',
          method: 'POST',
          status_code: 400,
          failure_stage: 'validation',
          error_code: 'missing_score_after_round',
        },
        context: { request, sourcePage: '/api/rounds' },
      });
      return errorResponse('Score is required in After Round mode', 400);
    }

    const insertScore = data.hole_by_hole ? 0 : data.score!;
    const insertFir = !data.hole_by_hole ? data.fir_hit ?? null : null;
    const insertGir = !data.hole_by_hole ? data.gir_hit ?? null : null;
    const insertPutts = !data.hole_by_hole ? data.putts ?? null : null;
    const insertPenalties = !data.hole_by_hole ? data.penalties ?? null : null;

    // Parse date from user input (YYYY-MM-DD format)
    // Use current UTC time to ensure proper ordering for rounds on the same day
    const [year, month, day] = data.date.split('-').map(Number);
    const now = new Date();
    const roundDate = new Date(Date.UTC(
      year,
      month - 1,
      day,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds()
    ));

    // Get tee with all fields needed for resolveTeeContext
    const tee = await prisma.tee.findUnique({
      where: { id: teeId },
      include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } },
    });

    if (!tee) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.apiRequestFailed,
        distinctId: userId.toString(),
        properties: {
          endpoint: '/api/rounds',
          method: 'POST',
          status_code: 404,
          failure_stage: 'lookup',
          error_code: 'tee_not_found',
        },
        context: { request, sourcePage: '/api/rounds' },
      });
      return errorResponse('Tee not found', 404);
    }

    const teeSegment = data.tee_segment as TeeSegment;
    const ctx = resolveTeeContext(tee, teeSegment);
    const toPar = insertScore - ctx.parTotal;

    const userStats = await prisma.userLeaderboardStats.findUnique({
      where: { userId },
      select: { handicap: true },
    });

    const netResult = calculateNetScore(
      insertScore,
      userStats?.handicap != null ? Number(userStats.handicap) : null,
      ctx
    );
    const netScore = netResult.netScore;
    const netToPar = netResult.netToPar;
    
    // Create round
    const round = await prisma.round.create({
      data: {
        userId,
        courseId,
        teeId,
        teeSegment,
        holesPlayed: ctx.holes,
        holeByHole: data.hole_by_hole,
        date: roundDate,
        score: insertScore,
        netScore,
        toPar,
        netToPar,
        firHit: insertFir,
        girHit: insertGir,
        putts: insertPutts,
        penalties: insertPenalties,
        notes: data.notes ?? null,
        handicapAtRound: userStats?.handicap ?? null,
      },
    });

    const roundId = round.id;

    // Create hole-by-hole data if provided
    if (data.hole_by_hole && data.round_holes && data.round_holes.length) {
      await prisma.roundHole.createMany({
        data: data.round_holes.map((h: any) => ({
          roundId,
          holeId: BigInt(h.hole_id),
          pass: h.pass ?? 1,
          score: h.score ?? 0,
          firHit: h.fir_hit ?? null,
          girHit: h.gir_hit ?? null,
          putts: h.putts ?? null,
          penalties: h.penalties ?? null,
        })),
      });

      // Recalculate round totals
      await recalcRoundTotals(roundId);
    }

    const sg = await calculateStrokesGained({ userId, roundId }, prisma);

    await prisma.roundStrokesGained.create({
      data: {
        roundId,
        userId,
        sgTotal: sg.sgTotal,
        sgOffTee: sg.sgOffTee,
        sgApproach: sg.sgApproach,
        sgPutting: sg.sgPutting,
        sgPenalties: sg.sgPenalties,
        sgResidual: sg.sgResidual,
        confidence: sg.confidence,
        messages: sg.messages,
        partialAnalysis: sg.partialAnalysis,
      },
    });

    // Update leaderboard
    await recalcLeaderboard(userId);

    // Trigger insights generation asynchronously (don't await)
    triggerInsightsGeneration(roundId, userId).catch((error: any) => {
      console.error('Failed to generate insights:', error);
    });
    triggerOverallInsightsGeneration(userId).catch((error: any) => {
      console.error('Failed to regenerate overall insights:', error);
    });

    const storedRound = await prisma.round.findUnique({
      where: { id: roundId },
      select: {
        holesPlayed: true,
        holeByHole: true,
        firHit: true,
        girHit: true,
        putts: true,
        penalties: true,
      },
    });
    const roundsLifetime = await prisma.round.count({ where: { userId } });

    await captureServerEvent({
      event: ANALYTICS_EVENTS.roundAddCompleted,
      distinctId: userId.toString(),
      properties: {
        round_id: roundId.toString(),
        holes: storedRound?.holesPlayed ?? ctx.holes,
        mode: (storedRound?.holeByHole ?? data.hole_by_hole)
          ? 'live_round'
          : 'after_round',
        stats_tracked_count: countTrackedStats({
          firHit: storedRound?.firHit ?? null,
          girHit: storedRound?.girHit ?? null,
          putts: storedRound?.putts ?? null,
          penalties: storedRound?.penalties ?? null,
        }),
        course_id_present: true,
        rounds_lifetime: roundsLifetime,
      },
      context: {
        request,
        sourcePage: '/api/rounds',
        isLoggedIn: true,
      },
    });

    if (roundsLifetime === 1) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.firstRoundCompleted,
        distinctId: userId.toString(),
        properties: {
          rounds_lifetime: roundsLifetime,
          round_id: roundId.toString(),
        },
        context: { request, sourcePage: '/api/rounds', isLoggedIn: true },
      });
    }

    if (roundsLifetime === 3) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.thirdRoundCompleted,
        distinctId: userId.toString(),
        properties: {
          rounds_lifetime: roundsLifetime,
          round_id: roundId.toString(),
        },
        context: { request, sourcePage: '/api/rounds', isLoggedIn: true },
      });
    }

    return successResponse({ message: 'Round created', roundId: roundId.toString() }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/rounds error:', error);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.apiRequestFailed,
      distinctId: 'anonymous',
      properties: {
        endpoint: '/api/rounds',
        method: 'POST',
        status_code: 500,
        failure_stage: 'exception',
        error_code: 'server_exception',
      },
      context: { request, sourcePage: '/api/rounds', isLoggedIn: false },
    });
    return errorResponse('Database error', 500);
  }
}

// Helper to trigger insights generation for premium users
async function triggerInsightsGeneration(roundId: bigint, userId: bigint): Promise<void> {
  // Check if user is premium or lifetime
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  if (user?.subscriptionTier === 'premium' || user?.subscriptionTier === 'lifetime') {
    try {
      await generateInsights(roundId, userId);
    } catch (error) {
      // Silently fail - insights can be generated later if needed
      console.error('Failed to generate insights:', error);
    }
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

// Helper to recalculate round totals from hole-by-hole data
async function recalcRoundTotals(roundId: bigint): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      teeId: true,
      teeSegment: true,
      tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } },
      userId: true,
    },
  });
  if (!round) return;

  const holes = await prisma.roundHole.findMany({
    where: { roundId },
    select: { score: true, firHit: true, girHit: true, putts: true, penalties: true },
  });
  if (!holes.length) return;

  const totalScore = holes.reduce((sum, h) => sum + h.score, 0);

  const segment = (round.teeSegment ?? 'full') as TeeSegment;
  const ctx = resolveTeeContext(round.tee, segment);

  const userStats = await prisma.userLeaderboardStats.findUnique({
    where: { userId: round.userId },
    select: { handicap: true },
  });

  const netResult = calculateNetScore(
    totalScore,
    userStats?.handicap != null ? Number(userStats.handicap) : null,
    ctx
  );
  const netScore = netResult.netScore;
  const netToPar = netResult.netToPar;

  const toPar = totalScore - ctx.parTotal;

  const totals: {
    score: number;
    toPar: number | null;
    netScore: number | null;
    netToPar: number | null;
    firHit: number | null;
    girHit: number | null;
    putts: number | null;
    penalties: number | null;
  } = {
    score: totalScore,
    toPar,
    netScore,
    netToPar,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
  };

  const sumField = (field: keyof typeof holes[0]) => {
    const values = holes.map(h => h[field]).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  totals.firHit = sumField('firHit');
  totals.girHit = sumField('girHit');
  totals.putts = sumField('putts');
  totals.penalties = sumField('penalties');

  await prisma.round.update({ where: { id: roundId }, data: totals });
}

function countTrackedStats(input: {
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
}): number {
  let tracked = 0;
  if (input.firHit != null) tracked += 1;
  if (input.girHit != null) tracked += 1;
  if (input.putts != null) tracked += 1;
  if (input.penalties != null) tracked += 1;
  return tracked;
}
