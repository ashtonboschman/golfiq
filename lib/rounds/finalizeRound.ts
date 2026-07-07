import type { NextRequest } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import { generateAndStoreOverallInsights } from '@/app/api/insights/overall/route';
import { generateInsights } from '@/app/api/rounds/[id]/insights/route';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { calculateNetScore } from '@/lib/utils/handicap';
import { recalcLeaderboard } from '@/lib/utils/leaderboard';
import { calculateStrokesGained } from '@/lib/utils/strokesGained';

export const ROUND_CONTEXT_VALUES = ['real', 'simulator', 'practice'] as const;
export const ROUND_MISS_DIRECTION_VALUES = ['hit', 'miss_left', 'miss_right', 'miss_short', 'miss_long'] as const;

export type RoundContext = (typeof ROUND_CONTEXT_VALUES)[number];
type RoundMissDirection = (typeof ROUND_MISS_DIRECTION_VALUES)[number];

const roundMissDirectionSchema = z.enum(ROUND_MISS_DIRECTION_VALUES);
const optionalRoundShortGameStatSchema = z.number().int().min(0).max(99).nullable().optional();
const optionalRoundShortGameAggregateSchema = z.number().int().min(0).max(198).nullable().optional();
const optionalHoleShortGameStatSchema = z.number().int().min(0).max(6).nullable().optional();

const completedRoundInputSchema = z.object({
  course_id: z.union([z.string(), z.number()]).refine((val: string | number) => {
    const num = typeof val === 'string' ? Number(val) : val;
    return !Number.isNaN(num) && num > 0;
  }, { message: 'course_id must be a valid positive number' }),
  tee_id: z.union([z.string(), z.number()]).refine((val: string | number) => {
    const num = typeof val === 'string' ? Number(val) : val;
    return !Number.isNaN(num) && num > 0;
  }, { message: 'tee_id must be a valid positive number' }),
  date: z.string().min(1, 'date is required'),
  score: z.number().nullable().optional(),
  fir_hit: z.number().nullable().optional(),
  gir_hit: z.number().nullable().optional(),
  putts: z.number().nullable().optional(),
  penalties: z.number().nullable().optional(),
  chips: optionalRoundShortGameStatSchema,
  greenside_bunker_shots: optionalRoundShortGameStatSchema,
  short_game_shots: optionalRoundShortGameAggregateSchema,
  notes: z.string().optional().default(''),
  tee_segment: z.enum(['full', 'front9', 'back9', 'double9']).optional().default('full'),
  round_context: z.enum(ROUND_CONTEXT_VALUES).optional().default('real'),
  hole_by_hole: z.union([z.boolean(), z.number()])
    .transform((val: boolean | number) => (typeof val === 'number' ? val === 1 : val))
    .optional()
    .default(false),
  round_holes: z.array(z.object({
    hole_id: z.union([z.string(), z.number()]),
    pass: z.number().optional().default(1),
    score: z.number().nullable(),
    fir_hit: z.number().nullable().optional(),
    fir_direction: roundMissDirectionSchema.nullable().optional(),
    gir_hit: z.number().nullable().optional(),
    gir_direction: roundMissDirectionSchema.nullable().optional(),
    putts: z.number().nullable().optional(),
    penalties: z.number().nullable().optional(),
    chips: optionalHoleShortGameStatSchema,
    greenside_bunker_shots: optionalHoleShortGameStatSchema,
  })).optional().default([]),
});

export type CompletedRoundInput = z.infer<typeof completedRoundInputSchema>;

type FailureStage = 'validation' | 'lookup';

export class CompletedRoundFinalizationError extends Error {
  status: number;
  failureStage: FailureStage;
  errorCode: string;

  constructor(message: string, args: { status: number; failureStage: FailureStage; errorCode: string }) {
    super(message);
    this.name = 'CompletedRoundFinalizationError';
    this.status = args.status;
    this.failureStage = args.failureStage;
    this.errorCode = args.errorCode;
  }
}

type CreateCompletedRoundArgs = {
  userId: bigint;
  input: unknown;
  db?: CompletedRoundDbClient;
  deferPostCommitSideEffects?: boolean;
  analytics?: {
    request?: NextRequest;
    sourcePage?: string;
    isLoggedIn?: boolean;
  };
};

type CreateCompletedRoundResult = {
  roundId: bigint;
  runPostCommitSideEffects?: () => Promise<void>;
};

type CompletedRoundDbClient = PrismaClient | Prisma.TransactionClient;

function validationError(message: string, errorCode: string) {
  return new CompletedRoundFinalizationError(message, {
    status: 400,
    failureStage: 'validation',
    errorCode,
  });
}

function lookupError(message: string, errorCode: string) {
  return new CompletedRoundFinalizationError(message, {
    status: 404,
    failureStage: 'lookup',
    errorCode,
  });
}

function normalizeHoleDirection(
  hitValue: number | null | undefined,
  directionValue: RoundMissDirection | null | undefined,
): RoundMissDirection | null {
  if (hitValue == null) return null;

  if (hitValue === 1) {
    return directionValue === 'hit' ? 'hit' : null;
  }

  if (hitValue === 0) {
    if (!directionValue || directionValue === 'hit') return null;
    return directionValue;
  }

  return null;
}

function deriveShortGameShots(
  chips: number | null | undefined,
  greensideBunkerShots: number | null | undefined,
): number | null {
  if (chips == null && greensideBunkerShots == null) return null;
  return (chips ?? 0) + (greensideBunkerShots ?? 0);
}

function countTrackedStats(input: {
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greensideBunkerShots: number | null;
}): number {
  let tracked = 0;
  if (input.firHit != null) tracked += 1;
  if (input.girHit != null) tracked += 1;
  if (input.putts != null) tracked += 1;
  if (input.penalties != null) tracked += 1;
  if (input.chips != null) tracked += 1;
  if (input.greensideBunkerShots != null) tracked += 1;
  return tracked;
}

function parseCompletedRoundInput(input: unknown): CompletedRoundInput {
  const result = completedRoundInputSchema.safeParse(input);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw validationError(firstError?.message || 'Validation failed', 'validation_failed');
  }

  const data = result.data;

  if (!data.hole_by_hole && (data.score === null || data.score === undefined)) {
    throw validationError('Score is required in After Round mode', 'missing_score_after_round');
  }

  if (data.hole_by_hole) {
    if (!data.round_holes.length) {
      throw validationError('Hole-by-hole rounds require at least one hole score', 'missing_hole_scores');
    }

    const incompleteHole = data.round_holes.find((hole) => hole.score === null);
    if (incompleteHole) {
      throw validationError('Score is required for every hole in Live Round mode', 'missing_hole_score');
    }
  }

  return data;
}

function parseRoundDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const now = new Date();
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  ));
}

async function triggerInsightsGeneration(roundId: bigint, userId: bigint): Promise<void> {
  try {
    await generateInsights(roundId, userId);
  } catch (error) {
    console.error('Failed to generate insights:', error);
  }
}

async function triggerOverallInsightsGeneration(userId: bigint): Promise<void> {
  try {
    await generateAndStoreOverallInsights(userId, 'combined', { touchGeneratedAt: true });
  } catch (error) {
    console.error('Failed to regenerate overall insights:', error);
  }
}

async function recalcRoundTotals(roundId: bigint, db: CompletedRoundDbClient): Promise<void> {
  const round = await db.round.findUnique({
    where: { id: roundId },
    select: {
      teeId: true,
      teeSegment: true,
      tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } },
      userId: true,
    },
  });
  if (!round) return;

  const holes = await db.roundHole.findMany({
    where: { roundId },
    select: {
      score: true,
      firHit: true,
      girHit: true,
      putts: true,
      penalties: true,
      chips: true,
      greensideBunkerShots: true,
    },
  });
  if (!holes.length) return;

  const totalScore = holes.reduce((sum, h) => sum + h.score, 0);
  const segment = (round.teeSegment ?? 'full') as TeeSegment;
  const ctx = resolveTeeContext(round.tee, segment);

  const userStats = await db.userLeaderboardStats.findUnique({
    where: { userId: round.userId },
    select: { handicap: true },
  });

  const netResult = calculateNetScore(
    totalScore,
    userStats?.handicap != null ? Number(userStats.handicap) : null,
    ctx,
  );

  const totals: {
    score: number;
    toPar: number | null;
    netScore: number | null;
    netToPar: number | null;
    firHit: number | null;
    girHit: number | null;
    putts: number | null;
    penalties: number | null;
    chips: number | null;
    greensideBunkerShots: number | null;
    shortGameShots: number | null;
  } = {
    score: totalScore,
    toPar: totalScore - ctx.parTotal,
    netScore: netResult.netScore,
    netToPar: netResult.netToPar,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
    chips: null,
    greensideBunkerShots: null,
    shortGameShots: null,
  };

  const sumField = (field: keyof typeof holes[0]) => {
    const values = holes.map((hole) => hole[field]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };

  totals.firHit = sumField('firHit');
  totals.girHit = sumField('girHit');
  totals.putts = sumField('putts');
  totals.penalties = sumField('penalties');
  totals.chips = sumField('chips');
  totals.greensideBunkerShots = sumField('greensideBunkerShots');
  totals.shortGameShots = deriveShortGameShots(totals.chips, totals.greensideBunkerShots);

  await db.round.update({ where: { id: roundId }, data: totals });
}

export async function createCompletedRoundFromInput({
  userId,
  input,
  db = prisma,
  deferPostCommitSideEffects = false,
  analytics,
}: CreateCompletedRoundArgs): Promise<CreateCompletedRoundResult> {
  const data = parseCompletedRoundInput(input);
  const courseId = BigInt(data.course_id);
  const teeId = BigInt(data.tee_id);

  const insertScore = data.hole_by_hole ? 0 : data.score!;
  const insertFir = !data.hole_by_hole ? data.fir_hit ?? null : null;
  const insertGir = !data.hole_by_hole ? data.gir_hit ?? null : null;
  const insertPutts = !data.hole_by_hole ? data.putts ?? null : null;
  const insertPenalties = !data.hole_by_hole ? data.penalties ?? null : null;
  const insertChips = !data.hole_by_hole ? data.chips ?? null : null;
  const insertGreensideBunkerShots = !data.hole_by_hole ? data.greenside_bunker_shots ?? null : null;
  const insertShortGameShots = !data.hole_by_hole
    ? deriveShortGameShots(insertChips, insertGreensideBunkerShots)
    : null;

  const tee = await db.tee.findUnique({
    where: { id: teeId },
    include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } },
  });

  if (!tee) {
    throw lookupError('Tee not found', 'tee_not_found');
  }

  const teeSegment = data.tee_segment as TeeSegment;
  const ctx = resolveTeeContext(tee, teeSegment);

  if (data.hole_by_hole && data.round_holes.length !== ctx.holes) {
    throw validationError('Hole-by-hole rounds must include a score for every played hole', 'incomplete_hole_scores');
  }

  const toPar = insertScore - ctx.parTotal;

  const userStats = await db.userLeaderboardStats.findUnique({
    where: { userId },
    select: { handicap: true },
  });

  const netResult = calculateNetScore(
    insertScore,
    userStats?.handicap != null ? Number(userStats.handicap) : null,
    ctx,
  );

  const roundDate = parseRoundDate(data.date);

  const round = await db.round.create({
    data: {
      userId,
      courseId,
      teeId,
      teeSegment,
      holesPlayed: ctx.holes,
      roundContext: data.round_context,
      holeByHole: data.hole_by_hole,
      date: roundDate,
      score: insertScore,
      netScore: netResult.netScore,
      toPar,
      netToPar: netResult.netToPar,
      firHit: insertFir,
      girHit: insertGir,
      putts: insertPutts,
      penalties: insertPenalties,
      chips: insertChips,
      greensideBunkerShots: insertGreensideBunkerShots,
      shortGameShots: insertShortGameShots,
      notes: data.notes ?? null,
      handicapAtRound: userStats?.handicap ?? null,
    },
  });

  const roundId = round.id;

  if (data.hole_by_hole && data.round_holes.length) {
    await db.roundHole.createMany({
      data: data.round_holes.map((hole) => ({
        roundId,
        holeId: BigInt(hole.hole_id),
        pass: hole.pass ?? 1,
        score: hole.score!,
        firHit: hole.fir_hit ?? null,
        firDirection: normalizeHoleDirection(hole.fir_hit ?? null, hole.fir_direction ?? null),
        girHit: hole.gir_hit ?? null,
        girDirection: normalizeHoleDirection(hole.gir_hit ?? null, hole.gir_direction ?? null),
        putts: hole.putts ?? null,
        penalties: hole.penalties ?? null,
        chips: hole.chips ?? null,
        greensideBunkerShots: hole.greenside_bunker_shots ?? null,
      })),
    });

    await recalcRoundTotals(roundId, db);
  }

  const sg = await calculateStrokesGained({ userId, roundId }, db);

  await db.roundStrokesGained.create({
    data: {
      roundId,
      userId,
      sgTotal: sg.sgTotal,
      sgOffTee: sg.sgOffTee,
      sgApproach: sg.sgApproach,
      sgShortGame: sg.sgShortGame,
      sgPutting: sg.sgPutting,
      sgPenalties: sg.sgPenalties,
      sgResidual: sg.sgResidual,
      confidence: sg.confidence,
      messages: sg.messages,
      partialAnalysis: sg.partialAnalysis,
    },
  });

  await recalcLeaderboard(userId, db);

  const runPostCommitSideEffects = async () => {
    await Promise.all([
      triggerInsightsGeneration(roundId, userId),
      triggerOverallInsightsGeneration(userId),
    ]);

    const storedRound = await prisma.round.findUnique({
      where: { id: roundId },
      select: {
        holesPlayed: true,
        holeByHole: true,
        firHit: true,
        girHit: true,
        putts: true,
        penalties: true,
        chips: true,
        greensideBunkerShots: true,
        shortGameShots: true,
      },
    });
    const officialRoundsLifetime = await prisma.round.count({
      where: { userId, roundContext: 'real' },
    });

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
          chips: storedRound?.chips ?? null,
          greensideBunkerShots: storedRound?.greensideBunkerShots ?? null,
        }),
        has_chips_tracked: storedRound?.chips != null,
        has_greenside_bunker_tracked: storedRound?.greensideBunkerShots != null,
        short_game_shots_tracked: storedRound?.shortGameShots != null,
        course_id_present: true,
        rounds_lifetime: officialRoundsLifetime,
        round_context: data.round_context,
      },
      context: {
        request: analytics?.request,
        sourcePage: analytics?.sourcePage ?? '/api/rounds',
        isLoggedIn: analytics?.isLoggedIn ?? true,
      },
    });

    if (officialRoundsLifetime === 1) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.firstRoundCompleted,
        distinctId: userId.toString(),
        properties: {
          rounds_lifetime: officialRoundsLifetime,
          round_id: roundId.toString(),
        },
        context: {
          request: analytics?.request,
          sourcePage: analytics?.sourcePage ?? '/api/rounds',
          isLoggedIn: analytics?.isLoggedIn ?? true,
        },
      });
    }

    if (officialRoundsLifetime === 2) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.secondRoundCompleted,
        distinctId: userId.toString(),
        properties: {
          rounds_lifetime: officialRoundsLifetime,
          round_id: roundId.toString(),
        },
        context: {
          request: analytics?.request,
          sourcePage: analytics?.sourcePage ?? '/api/rounds',
          isLoggedIn: analytics?.isLoggedIn ?? true,
        },
      });
    }

    if (officialRoundsLifetime === 3) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.thirdRoundCompleted,
        distinctId: userId.toString(),
        properties: {
          rounds_lifetime: officialRoundsLifetime,
          round_id: roundId.toString(),
        },
        context: {
          request: analytics?.request,
          sourcePage: analytics?.sourcePage ?? '/api/rounds',
          isLoggedIn: analytics?.isLoggedIn ?? true,
        },
      });
    }
  };

  if (deferPostCommitSideEffects) {
    return { roundId, runPostCommitSideEffects };
  }

  await runPostCommitSideEffects();
  return { roundId };
}
