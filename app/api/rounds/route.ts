import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import {
  CompletedRoundFinalizationError,
  createCompletedRoundFromInput,
  type RoundContext,
} from '@/lib/rounds/finalizeRound';

type RoundWithRelations = {
  id: bigint;
  userId: bigint;
  courseId: bigint;
  teeId: bigint;
  holeByHole: boolean;
  holesPlayed: number;
  roundContext?: RoundContext | null;
  toPar: number | null;
  teeSegment: string;
  date: Date;
  score: number;
  netScore: number | null;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greensideBunkerShots: number | null;
  shortGameShots: number | null;
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
    round_context: round.roundContext ?? 'real',
    date: round.date,
    score: round.score === null ? null : Number(round.score),
    net_score: round.netScore === null ? null : Number(round.netScore),
    fir_hit: round.firHit === null ? null : Number(round.firHit),
    gir_hit: round.girHit === null ? null : Number(round.girHit),
    putts: round.putts === null ? null : Number(round.putts),
    penalties: round.penalties === null ? null : Number(round.penalties),
    chips: round.chips === null ? null : Number(round.chips),
    greenside_bunker_shots: round.greensideBunkerShots === null ? null : Number(round.greensideBunkerShots),
    short_game_shots: round.shortGameShots === null ? null : Number(round.shortGameShots),
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

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const page = Number.isFinite(rawPage) ? Math.max(rawPage, 1) : 1;
    const search = searchParams.get('search')?.trim().slice(0, 100);

    const skip = (page - 1) * limit;
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
        { createdAt: 'desc' },
      ],
      take: limit,
      skip,
    });

    return successResponse({ rounds: rounds.map(formatRoundRow) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/rounds error:', error);
    return errorResponse('Database error', 500);
  }
}

export async function POST(request: NextRequest) {
  let userId: bigint | null = null;

  try {
    userId = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid request body', 400);
    }

    const { roundId } = await createCompletedRoundFromInput({
      userId,
      input: body,
      analytics: {
        request,
        sourcePage: '/api/rounds',
        isLoggedIn: true,
      },
    });

    return successResponse({ message: 'Round created', roundId: roundId.toString() }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    if (error instanceof CompletedRoundFinalizationError) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.apiRequestFailed,
        distinctId: userId?.toString() ?? 'anonymous',
        properties: {
          endpoint: '/api/rounds',
          method: 'POST',
          status_code: error.status,
          failure_stage: error.failureStage,
          error_code: error.errorCode,
        },
        context: { request, sourcePage: '/api/rounds', isLoggedIn: true },
      });
      return errorResponse(error.message, error.status);
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
