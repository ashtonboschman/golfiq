import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  CompletedRoundFinalizationError,
  createCompletedRoundFromInput,
  ROUND_CONTEXT_VALUES,
  ROUND_MISS_DIRECTION_VALUES,
  type RoundContext,
} from '@/lib/rounds/finalizeRound';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';

const TEE_SEGMENT_VALUES = ['full', 'front9', 'back9', 'double9'] as const;
const LIVE_ROUND_STEP_VALUES = ['GPS', 'SCORE'] as const;
const LIVE_ROUND_FINALIZE_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 30_000,
} as const;

type LiveRoundActiveStep = (typeof LIVE_ROUND_STEP_VALUES)[number];
type RoundMissDirection = (typeof ROUND_MISS_DIRECTION_VALUES)[number];

type LiveRoundStatus = 'ACTIVE' | 'COMPLETED' | 'DISCARDED';

type TeeWithCourseAndHoles = {
  id: bigint;
  courseId: bigint;
  numberOfHoles: number | null;
  courseRating: unknown;
  slopeRating: number | null;
  bogeyRating: unknown;
  parTotal: number | null;
  nonPar3Holes: number;
  frontCourseRating: unknown;
  frontSlopeRating: number | null;
  frontBogeyRating: unknown;
  backCourseRating: unknown;
  backSlopeRating: number | null;
  backBogeyRating: unknown;
  teeName?: string | null;
  gender?: string | null;
  course?: {
    id: bigint;
    clubName: string;
    courseName: string;
  };
  holes: Array<{
    id: bigint;
    holeNumber: number;
    par: number;
    yardage?: number | null;
    handicap?: number | null;
  }>;
};

type LiveRoundHoleDraftRow = {
  id: bigint;
  sessionId: bigint;
  holeId: bigint;
  holeNumber: number;
  displayHoleNumber: number;
  pass: number;
  score: number | null;
  firHit: number | null;
  firDirection: RoundMissDirection | null;
  girHit: number | null;
  girDirection: RoundMissDirection | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greensideBunkerShots: number | null;
  createdAt: Date;
  updatedAt: Date;
  hole?: {
    id: bigint;
    holeNumber: number;
    par: number;
    yardage: number | null;
    handicap: number | null;
  };
};

type LiveRoundSessionRow = {
  id: bigint;
  userId: bigint;
  courseId: bigint;
  teeId: bigint;
  finalRoundId: bigint | null;
  status: LiveRoundStatus;
  date: Date;
  teeSegment: string;
  roundContext: RoundContext;
  notes: string | null;
  startHoleNumber: number;
  activeHoleNumber: number;
  activeHolePass: number;
  activeStep: LiveRoundActiveStep;
  liveRoundTrackFir: boolean;
  liveRoundTrackGir: boolean;
  liveRoundTrackChips: boolean;
  liveRoundTrackGreensideBunkerShots: boolean;
  liveRoundTrackPutts: boolean;
  liveRoundTrackPenalties: boolean;
  startedAt: Date;
  lastSavedAt: Date;
  completedAt: Date | null;
  discardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  course?: {
    id: bigint;
    clubName: string;
    courseName: string;
  };
  tee?: TeeWithCourseAndHoles;
  finalRound?: {
    id: bigint;
    score: number;
    date: Date;
  } | null;
  holeDrafts?: LiveRoundHoleDraftRow[];
};

type ExpectedDraft = {
  holeId: bigint;
  holeNumber: number;
  displayHoleNumber: number;
  pass: number;
};

const idSchema = z.union([z.string(), z.number(), z.bigint()]).transform((value, ctx) => {
  try {
    const parsed = BigInt(value);
    if (parsed <= BigInt(0)) throw new Error('not positive');
    return parsed;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'ID must be a valid positive number' });
    return z.NEVER;
  }
});

const optionalNullableIntSchema = z.number().int().nullable().optional();
const optionalHoleShortGameStatSchema = z.number().int().min(0).max(6).nullable().optional();

const createLiveRoundSessionSchema = z.object({
  course_id: idSchema,
  tee_id: idSchema,
  date: z.string().min(1, 'date is required'),
  tee_segment: z.enum(TEE_SEGMENT_VALUES).optional().default('full'),
  start_hole_number: z.number().int().min(1).max(18).optional(),
  round_context: z.enum(ROUND_CONTEXT_VALUES).optional().default('real'),
  notes: z.string().nullable().optional(),
  tracking_prefs: z.object({
    fir: z.boolean().optional(),
    gir: z.boolean().optional(),
    chips: z.boolean().optional(),
    greenside_bunker_shots: z.boolean().optional(),
    putts: z.boolean().optional(),
    penalties: z.boolean().optional(),
  }).optional(),
});

const saveLiveRoundHoleDraftSchema = z.object({
  hole_id: idSchema.optional(),
  draft_id: idSchema.optional(),
  pass: z.number().int().min(1).max(2).optional().default(1),
  score: z.number().int().min(1).max(99).nullable().optional(),
  fir_hit: optionalNullableIntSchema,
  fir_direction: z.enum(ROUND_MISS_DIRECTION_VALUES).nullable().optional(),
  gir_hit: optionalNullableIntSchema,
  gir_direction: z.enum(ROUND_MISS_DIRECTION_VALUES).nullable().optional(),
  putts: optionalNullableIntSchema,
  penalties: optionalNullableIntSchema,
  chips: optionalHoleShortGameStatSchema,
  greenside_bunker_shots: optionalHoleShortGameStatSchema,
}).refine((value) => value.hole_id !== undefined || value.draft_id !== undefined, {
  message: 'hole_id or draft_id is required',
});

const updateLiveRoundNavigationSchema = z.object({
  active_hole_number: z.number().int().min(1).max(18).optional(),
  active_hole_pass: z.number().int().min(1).max(2).optional().default(1),
  active_step: z.enum(LIVE_ROUND_STEP_VALUES).optional(),
  round_context: z.enum(ROUND_CONTEXT_VALUES).optional(),
  notes: z.string().max(4000).nullable().optional(),
}).refine((value) => (
  value.active_hole_number !== undefined ||
  value.active_step !== undefined ||
  value.round_context !== undefined ||
  value.notes !== undefined
), {
  message: 'At least one live round field is required',
});

export type CreateLiveRoundSessionInput = z.input<typeof createLiveRoundSessionSchema>;
export type SaveLiveRoundHoleDraftInput = z.input<typeof saveLiveRoundHoleDraftSchema>;
export type UpdateLiveRoundNavigationInput = z.input<typeof updateLiveRoundNavigationSchema>;

export class LiveRoundSessionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'LiveRoundSessionError';
    this.status = status;
    this.code = code;
  }
}

function liveRoundError(message: string, status: number, code: string) {
  return new LiveRoundSessionError(message, status, code);
}

function parseSessionId(sessionId: string) {
  try {
    const parsed = BigInt(sessionId);
    if (parsed <= BigInt(0)) throw new Error('not positive');
    return parsed;
  } catch {
    throw liveRoundError('Invalid live round session id', 400, 'invalid_session_id');
  }
}

function parseRoundDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    throw liveRoundError('date must use YYYY-MM-DD format', 400, 'invalid_date');
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function dateToRoundInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function normalizeServiceError(error: unknown): never {
  if (error instanceof LiveRoundSessionError) throw error;
  if (error instanceof CompletedRoundFinalizationError) {
    throw liveRoundError(error.message, error.status, error.errorCode);
  }
  if (error instanceof z.ZodError) {
    throw liveRoundError(error.issues[0]?.message || 'Validation failed', 400, 'validation_failed');
  }
  throw error;
}

function serializeHoleDraft(draft: LiveRoundHoleDraftRow) {
  return {
    id: draft.id.toString(),
    session_id: draft.sessionId.toString(),
    hole_id: draft.holeId.toString(),
    hole_number: draft.holeNumber,
    display_hole_number: draft.displayHoleNumber,
    pass: draft.pass,
    score: draft.score,
    fir_hit: draft.firHit,
    fir_direction: draft.firDirection,
    gir_hit: draft.girHit,
    gir_direction: draft.girDirection,
    putts: draft.putts,
    penalties: draft.penalties,
    chips: draft.chips,
    greenside_bunker_shots: draft.greensideBunkerShots,
    created_at: toIso(draft.createdAt),
    updated_at: toIso(draft.updatedAt),
    hole: draft.hole ? {
      id: draft.hole.id.toString(),
      hole_number: draft.hole.holeNumber,
      par: draft.hole.par,
      yardage: draft.hole.yardage,
      handicap: draft.hole.handicap,
    } : null,
  };
}

function resolveSessionTeeContext(session: LiveRoundSessionRow) {
  if (!session.tee) return null;

  try {
    return resolveTeeContext(session.tee, session.teeSegment as TeeSegment);
  } catch {
    return null;
  }
}

export function serializeLiveRoundSession(session: LiveRoundSessionRow) {
  const teeContext = resolveSessionTeeContext(session);

  return {
    id: session.id.toString(),
    user_id: session.userId.toString(),
    course_id: session.courseId.toString(),
    tee_id: session.teeId.toString(),
    final_round_id: session.finalRoundId?.toString() ?? null,
    status: session.status,
    date: session.date,
    tee_segment: session.teeSegment,
    round_context: session.roundContext,
    notes: session.notes,
    start_hole_number: session.startHoleNumber,
    active_hole_number: session.activeHoleNumber,
    active_hole_pass: session.activeHolePass,
    active_step: session.activeStep,
    tracking_prefs: {
      fir: session.liveRoundTrackFir,
      gir: session.liveRoundTrackGir,
      chips: session.liveRoundTrackChips,
      greenside_bunker_shots: session.liveRoundTrackGreensideBunkerShots,
      putts: session.liveRoundTrackPutts,
      penalties: session.liveRoundTrackPenalties,
    },
    started_at: toIso(session.startedAt),
    last_saved_at: toIso(session.lastSavedAt),
    completed_at: toIso(session.completedAt),
    discarded_at: toIso(session.discardedAt),
    created_at: toIso(session.createdAt),
    updated_at: toIso(session.updatedAt),
    course: session.course ? {
      id: session.course.id.toString(),
      club_name: session.course.clubName,
      course_name: session.course.courseName,
    } : null,
    tee: session.tee ? {
      id: session.tee.id.toString(),
      tee_name: session.tee.teeName ?? null,
      gender: session.tee.gender ?? null,
      number_of_holes: session.tee.numberOfHoles,
      par_total: session.tee.parTotal,
      course_rating: teeContext?.courseRating ?? null,
      slope_rating: teeContext?.slopeRating ?? null,
    } : null,
    final_round: session.finalRound ? {
      id: session.finalRound.id.toString(),
      score: session.finalRound.score,
      date: session.finalRound.date,
    } : null,
    hole_drafts: session.holeDrafts?.map(serializeHoleDraft) ?? [],
  };
}

function buildExpectedDrafts(tee: TeeWithCourseAndHoles, teeSegment: TeeSegment): ExpectedDraft[] {
  let ctx;
  try {
    ctx = resolveTeeContext(tee, teeSegment);
  } catch (error) {
    throw liveRoundError(
      error instanceof Error ? error.message : 'Invalid tee segment',
      400,
      'invalid_tee_segment',
    );
  }

  const holesByNumber = new Map(tee.holes.map((hole) => [hole.holeNumber, hole]));

  if (teeSegment === 'double9') {
    return Array.from({ length: 18 }, (_, index) => {
      const displayHoleNumber = index + 1;
      const physicalHoleNumber = ((displayHoleNumber - 1) % 9) + 1;
      const hole = holesByNumber.get(physicalHoleNumber);
      if (!hole) {
        throw liveRoundError('Tee is missing holes needed for double9 play', 400, 'missing_tee_holes');
      }

      return {
        holeId: hole.id,
        holeNumber: hole.holeNumber,
        displayHoleNumber,
        pass: displayHoleNumber <= 9 ? 1 : 2,
      };
    });
  }

  return ctx.holeRange.map((holeNumber) => {
    const hole = holesByNumber.get(holeNumber);
    if (!hole) {
      throw liveRoundError('Tee is missing holes needed for this segment', 400, 'missing_tee_holes');
    }

    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      displayHoleNumber: holeNumber,
      pass: 1,
    };
  });
}

function assertActiveSession(session: LiveRoundSessionRow | null): LiveRoundSessionRow {
  if (!session) {
    throw liveRoundError('Live round session not found', 404, 'session_not_found');
  }

  if (session.status !== 'ACTIVE') {
    throw liveRoundError('Live round session is not active', 409, 'session_not_active');
  }

  return session;
}

const sessionInclude = {
  course: {
    select: {
      id: true,
      clubName: true,
      courseName: true,
    },
  },
  tee: {
    include: {
      holes: {
        select: {
          id: true,
          holeNumber: true,
          par: true,
          yardage: true,
          handicap: true,
        },
        orderBy: { holeNumber: 'asc' as const },
      },
    },
  },
  finalRound: {
    select: {
      id: true,
      score: true,
      date: true,
    },
  },
  holeDrafts: {
    include: {
      hole: {
        select: {
          id: true,
          holeNumber: true,
          par: true,
          yardage: true,
          handicap: true,
        },
      },
    },
    orderBy: [
      { displayHoleNumber: 'asc' as const },
      { pass: 'asc' as const },
    ],
  },
};

const activeSessionWhere = (userId: bigint, sessionId: bigint) => ({
  id: sessionId,
  userId,
  status: 'ACTIVE' as const,
});

async function lockLiveRoundSessionForUpdate(
  tx: Prisma.TransactionClient,
  userId: bigint,
  sessionId: bigint,
) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "live_round_sessions"
    WHERE "id" = ${sessionId} AND "user_id" = ${userId}
    FOR UPDATE
  `;
}

export async function createLiveRoundSession(userId: bigint, input: unknown) {
  try {
    const data = createLiveRoundSessionSchema.parse(input);

    const tee = await prisma.tee.findFirst({
      where: {
        id: data.tee_id,
        courseId: data.course_id,
      },
      include: {
        course: {
          select: {
            id: true,
            clubName: true,
            courseName: true,
          },
        },
        holes: {
          select: {
            id: true,
            holeNumber: true,
            par: true,
            yardage: true,
            handicap: true,
          },
          orderBy: { holeNumber: 'asc' },
        },
      },
    }) as TeeWithCourseAndHoles | null;

    if (!tee) {
      throw liveRoundError('Course or tee not found', 404, 'tee_not_found');
    }

    const expectedDrafts = buildExpectedDrafts(tee, data.tee_segment);
    if (expectedDrafts.length === 0) {
      throw liveRoundError('Tee has no playable holes', 400, 'missing_tee_holes');
    }
    const firstDraft = data.start_hole_number
      ? expectedDrafts.find((draft) => draft.displayHoleNumber === data.start_hole_number)
      : expectedDrafts[0];
    if (!firstDraft) {
      throw liveRoundError('Starting hole is not part of this live round', 400, 'invalid_start_hole');
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        liveRoundTrackFir: true,
        liveRoundTrackGir: true,
        liveRoundTrackChips: true,
        liveRoundTrackGreensideBunkerShots: true,
        liveRoundTrackPutts: true,
        liveRoundTrackPenalties: true,
      },
    });

    const trackingPrefs = {
      fir: data.tracking_prefs?.fir ?? profile?.liveRoundTrackFir ?? true,
      gir: data.tracking_prefs?.gir ?? profile?.liveRoundTrackGir ?? true,
      chips: data.tracking_prefs?.chips ?? profile?.liveRoundTrackChips ?? true,
      greensideBunkerShots:
        data.tracking_prefs?.greenside_bunker_shots ??
        profile?.liveRoundTrackGreensideBunkerShots ??
        true,
      putts: data.tracking_prefs?.putts ?? profile?.liveRoundTrackPutts ?? true,
      penalties: data.tracking_prefs?.penalties ?? profile?.liveRoundTrackPenalties ?? true,
    };

    const session = await prisma.liveRoundSession.create({
      data: {
        userId,
        courseId: data.course_id,
        teeId: data.tee_id,
        date: parseRoundDate(data.date),
        teeSegment: data.tee_segment,
        roundContext: data.round_context,
        notes: data.notes ?? null,
        startHoleNumber: firstDraft.displayHoleNumber,
        activeHoleNumber: firstDraft.displayHoleNumber,
        activeHolePass: firstDraft.pass,
        activeStep: 'SCORE',
        liveRoundTrackFir: trackingPrefs.fir,
        liveRoundTrackGir: trackingPrefs.gir,
        liveRoundTrackChips: trackingPrefs.chips,
        liveRoundTrackGreensideBunkerShots: trackingPrefs.greensideBunkerShots,
        liveRoundTrackPutts: trackingPrefs.putts,
        liveRoundTrackPenalties: trackingPrefs.penalties,
        holeDrafts: {
          create: expectedDrafts.map((draft) => ({
            holeId: draft.holeId,
            holeNumber: draft.holeNumber,
            displayHoleNumber: draft.displayHoleNumber,
            pass: draft.pass,
          })),
        },
      },
      include: sessionInclude,
    }) as LiveRoundSessionRow;

    return { session: serializeLiveRoundSession(session) };
  } catch (error) {
    normalizeServiceError(error);
  }
}

export async function listActiveLiveRoundSessions(userId: bigint) {
  const sessions = await prisma.liveRoundSession.findMany({
    where: {
      userId,
      status: 'ACTIVE',
    },
    include: sessionInclude,
    orderBy: [
      { lastSavedAt: 'desc' },
      { updatedAt: 'desc' },
    ],
  }) as LiveRoundSessionRow[];

  return { sessions: sessions.map(serializeLiveRoundSession) };
}

export async function getLiveRoundSession(userId: bigint, sessionIdParam: string) {
  const sessionId = parseSessionId(sessionIdParam);
  const session = await prisma.liveRoundSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    include: sessionInclude,
  }) as LiveRoundSessionRow | null;

  if (!session) {
    throw liveRoundError('Live round session not found', 404, 'session_not_found');
  }

  return { session: serializeLiveRoundSession(session) };
}

export async function saveLiveRoundHoleDraft(
  userId: bigint,
  sessionIdParam: string,
  input: unknown,
) {
  try {
    const sessionId = parseSessionId(sessionIdParam);
    const data = saveLiveRoundHoleDraftSchema.parse(input);

    const draftUpdate: Record<string, number | string | null | undefined> = {};
    if ('score' in data) draftUpdate.score = data.score;
    if ('fir_hit' in data) draftUpdate.firHit = data.fir_hit;
    if ('fir_direction' in data) draftUpdate.firDirection = data.fir_direction;
    if ('gir_hit' in data) draftUpdate.girHit = data.gir_hit;
    if ('gir_direction' in data) draftUpdate.girDirection = data.gir_direction;
    if ('putts' in data) draftUpdate.putts = data.putts;
    if ('penalties' in data) draftUpdate.penalties = data.penalties;
    if ('chips' in data) draftUpdate.chips = data.chips;
    if ('greenside_bunker_shots' in data) {
      draftUpdate.greensideBunkerShots = data.greenside_bunker_shots;
    }

    const [draft, updatedSession] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockLiveRoundSessionForUpdate(tx, userId, sessionId);
      const session = assertActiveSession(await tx.liveRoundSession.findFirst({
        where: activeSessionWhere(userId, sessionId),
      }) as LiveRoundSessionRow | null);

      const draftWhere = data.draft_id !== undefined
        ? { id: data.draft_id, sessionId: session.id }
        : { sessionId: session.id, holeId: data.hole_id!, pass: data.pass };
      const existingDraft = await tx.liveRoundHoleDraft.findFirst({
        where: draftWhere,
      }) as LiveRoundHoleDraftRow | null;

      if (!existingDraft) {
        throw liveRoundError('Live round hole draft not found', 404, 'hole_draft_not_found');
      }

      const savedDraft = await tx.liveRoundHoleDraft.update({
        where: { id: existingDraft.id },
        data: draftUpdate,
        include: {
          hole: {
            select: {
              id: true,
              holeNumber: true,
              par: true,
              yardage: true,
              handicap: true,
            },
          },
        },
      }) as LiveRoundHoleDraftRow;
      const savedSession = await tx.liveRoundSession.update({
        where: { id: session.id },
        data: { lastSavedAt: new Date() },
        include: sessionInclude,
      }) as LiveRoundSessionRow;

      return [savedDraft, savedSession] as const;
    });

    return {
      draft: serializeHoleDraft(draft),
      session: serializeLiveRoundSession(updatedSession),
    };
  } catch (error) {
    normalizeServiceError(error);
  }
}

export async function updateLiveRoundNavigation(
  userId: bigint,
  sessionIdParam: string,
  input: unknown,
) {
  try {
    const sessionId = parseSessionId(sessionIdParam);
    const data = updateLiveRoundNavigationSchema.parse(input);

    const updateData: {
      activeHoleNumber?: number;
      activeHolePass?: number;
      activeStep?: LiveRoundActiveStep;
      roundContext?: RoundContext;
      notes?: string | null;
      lastSavedAt: Date;
    } = {
      lastSavedAt: new Date(),
    };

    if (data.active_hole_number !== undefined) {
      updateData.activeHoleNumber = data.active_hole_number;
      updateData.activeHolePass = data.active_hole_pass;
      updateData.activeStep = data.active_step ?? 'SCORE';
    } else if (data.active_step !== undefined) {
      updateData.activeStep = data.active_step;
    }

    if (data.round_context !== undefined) {
      updateData.roundContext = data.round_context;
    }

    if ('notes' in data) {
      const trimmedNotes = data.notes?.trim() ?? '';
      updateData.notes = trimmedNotes.length ? trimmedNotes : null;
    }

    const updatedSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockLiveRoundSessionForUpdate(tx, userId, sessionId);
      const session = assertActiveSession(await tx.liveRoundSession.findFirst({
        where: activeSessionWhere(userId, sessionId),
      }) as LiveRoundSessionRow | null);

      if (data.active_hole_number !== undefined) {
        const targetDraft = await tx.liveRoundHoleDraft.findFirst({
          where: {
            sessionId: session.id,
            displayHoleNumber: data.active_hole_number,
            pass: data.active_hole_pass,
          },
        });

        if (!targetDraft) {
          throw liveRoundError('Active hole is not part of this live round session', 400, 'invalid_active_hole');
        }
      }

      return tx.liveRoundSession.update({
        where: { id: session.id },
        data: updateData,
        include: sessionInclude,
      }) as Promise<LiveRoundSessionRow>;
    });

    return { session: serializeLiveRoundSession(updatedSession) };
  } catch (error) {
    normalizeServiceError(error);
  }
}

export async function discardLiveRoundSession(userId: bigint, sessionIdParam: string) {
  const sessionId = parseSessionId(sessionIdParam);
  const updatedSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockLiveRoundSessionForUpdate(tx, userId, sessionId);
    const session = assertActiveSession(await tx.liveRoundSession.findFirst({
      where: activeSessionWhere(userId, sessionId),
    }) as LiveRoundSessionRow | null);

    const now = new Date();
    return tx.liveRoundSession.update({
      where: { id: session.id },
      data: {
        status: 'DISCARDED',
        discardedAt: now,
        lastSavedAt: now,
      },
      include: sessionInclude,
    }) as Promise<LiveRoundSessionRow>;
  });

  return { session: serializeLiveRoundSession(updatedSession) };
}

export async function finalizeLiveRoundSession(userId: bigint, sessionIdParam: string) {
  try {
    const sessionId = parseSessionId(sessionIdParam);
    let runPostCommitSideEffects: (() => Promise<void>) | undefined;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockLiveRoundSessionForUpdate(tx, userId, sessionId);

      const session = await tx.liveRoundSession.findFirst({
        where: {
          id: sessionId,
          userId,
        },
        include: sessionInclude,
      }) as LiveRoundSessionRow | null;

      if (!session) {
        throw liveRoundError('Live round session not found', 404, 'session_not_found');
      }

      if (session.status === 'COMPLETED' && session.finalRoundId) {
        return {
          roundId: session.finalRoundId.toString(),
          session: serializeLiveRoundSession(session),
        };
      }

      if (session.status !== 'ACTIVE') {
        throw liveRoundError('Live round session is not active', 409, 'session_not_active');
      }

      if (!session.tee || !session.holeDrafts) {
        throw liveRoundError('Live round session is missing tee or hole drafts', 400, 'invalid_session_state');
      }

      const teeSegment = session.teeSegment as TeeSegment;
      const expectedDrafts = buildExpectedDrafts(session.tee, teeSegment);
      const expectedKeys = new Set(expectedDrafts.map((draft) => `${draft.holeId.toString()}:${draft.pass}`));
      const actualKeys = new Set(session.holeDrafts.map((draft) => `${draft.holeId.toString()}:${draft.pass}`));

      if (expectedKeys.size !== actualKeys.size || [...expectedKeys].some((key) => !actualKeys.has(key))) {
        throw liveRoundError('Live round session is missing expected hole drafts', 400, 'incomplete_hole_drafts');
      }

      const incompleteDraft = session.holeDrafts.find((draft) => draft.score === null);
      if (incompleteDraft) {
        throw liveRoundError('Score is required for every hole before finishing a live round', 400, 'missing_hole_score');
      }

      const draftsByKey = new Map(session.holeDrafts.map((draft) => [`${draft.holeId.toString()}:${draft.pass}`, draft]));
      const roundHoles = expectedDrafts.map((expected) => {
        const draft = draftsByKey.get(`${expected.holeId.toString()}:${expected.pass}`);
        if (!draft) {
          throw liveRoundError('Live round session is missing expected hole drafts', 400, 'incomplete_hole_drafts');
        }

        return {
          hole_id: draft.holeId.toString(),
          pass: draft.pass,
          score: draft.score,
          fir_hit: draft.firHit,
          fir_direction: draft.firDirection,
          gir_hit: draft.girHit,
          gir_direction: draft.girDirection,
          putts: draft.putts,
          penalties: draft.penalties,
          chips: draft.chips,
          greenside_bunker_shots: draft.greensideBunkerShots,
        };
      });

      const finalizedRound = await createCompletedRoundFromInput({
        userId,
        db: tx,
        deferPostCommitSideEffects: true,
        input: {
          course_id: session.courseId.toString(),
          tee_id: session.teeId.toString(),
          date: dateToRoundInput(session.date),
          tee_segment: teeSegment,
          round_context: session.roundContext,
          notes: session.notes ?? '',
          hole_by_hole: 1,
          round_holes: roundHoles,
        },
        analytics: {
          sourcePage: '/api/rounds/live/sessions/[sessionId]/finalize',
          isLoggedIn: true,
        },
      });
      runPostCommitSideEffects = finalizedRound.runPostCommitSideEffects;

      const now = new Date();
      const updatedSession = await tx.liveRoundSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          finalRoundId: finalizedRound.roundId,
          completedAt: now,
          lastSavedAt: now,
        },
        include: sessionInclude,
      }) as LiveRoundSessionRow;

      return {
        roundId: finalizedRound.roundId.toString(),
        session: serializeLiveRoundSession(updatedSession),
      };
    }, LIVE_ROUND_FINALIZE_TRANSACTION_OPTIONS);

    if (runPostCommitSideEffects) {
      await runPostCommitSideEffects();
    }

    return result;
  } catch (error) {
    normalizeServiceError(error);
  }
}
