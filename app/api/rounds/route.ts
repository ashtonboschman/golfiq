import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { recalcLeaderboard } from '@/lib/utils/leaderboard';
import { z } from 'zod';

// Helper to format round data
type RoundWithRelations = {
  id: bigint;
  userId: bigint;
  courseId: bigint;
  teeId: bigint;
  holeByHole: boolean;
  advancedStats: boolean;
  date: Date;
  score: number;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  notes: string | null;
  createdDate: Date;
  updatedDate: Date;
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
    created_date: round.createdDate,
    updated_date: round.updatedDate,
    course: {
      id: Number(round.courseId),
      course_name: round.course?.courseName || null,
      club_name: round.course?.clubName || null,
    },
    tee: {
      id: Number(round.teeId),
      tee_name: round.tee?.teeName || null,
      gender: round.tee?.gender || null,
      par_total: round.tee?.parTotal ?? null,
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
        { createdDate: 'desc' }
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
  hole_by_hole: z.union([z.boolean(), z.number()]).transform((val: any) => typeof val === 'number' ? val === 1 : val).optional().default(false),
  advanced_stats: z.union([z.boolean(), z.number()]).transform((val: any) => typeof val === 'number' ? val === 1 : val).optional().default(false),
  round_holes: z.array(z.object({
    hole_id: z.union([z.string(), z.number()]),
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
      return errorResponse(firstError?.message || 'Validation failed', 400);
    }

    const data = result.data;
    const courseId = BigInt(data.course_id);
    const teeId = BigInt(data.tee_id);

    // Validate score is provided if not hole-by-hole mode
    if (!data.hole_by_hole && (data.score === null || data.score === undefined)) {
      return errorResponse('Score is required in Quick Score mode', 400);
    }

    const insertScore = data.hole_by_hole ? 0 : data.score!;
    const insertFir = !data.hole_by_hole && data.advanced_stats ? data.fir_hit ?? null : null;
    const insertGir = !data.hole_by_hole && data.advanced_stats ? data.gir_hit ?? null : null;
    const insertPutts = !data.hole_by_hole && data.advanced_stats ? data.putts ?? null : null;
    const insertPenalties = !data.hole_by_hole && data.advanced_stats ? data.penalties ?? null : null;

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

    // Get tee's par_total to calculate toPar
    const tee = await prisma.tee.findUnique({
      where: { id: teeId },
      select: { parTotal: true },
    });

    const toPar = tee?.parTotal ? insertScore - tee.parTotal : null;

    // Create round
    const round = await prisma.round.create({
      data: {
        userId,
        courseId,
        teeId,
        holeByHole: data.hole_by_hole,
        advancedStats: data.advanced_stats,
        date: roundDate,
        score: insertScore,
        toPar,
        firHit: insertFir,
        girHit: insertGir,
        putts: insertPutts,
        penalties: insertPenalties,
        notes: data.notes ?? null,
      },
    });

    const roundId = round.id;

    // Create hole-by-hole data if provided
    if (data.hole_by_hole && data.round_holes && data.round_holes.length) {
      await prisma.roundHole.createMany({
        data: data.round_holes.map((h: any) => ({
          roundId,
          holeId: BigInt(h.hole_id),
          score: h.score ?? 0,
          firHit: data.advanced_stats ? h.fir_hit ?? null : null,
          girHit: data.advanced_stats ? h.gir_hit ?? null : null,
          putts: data.advanced_stats ? h.putts ?? null : null,
          penalties: data.advanced_stats ? h.penalties ?? null : null,
        })),
      });

      // Recalculate round totals
      await recalcRoundTotals(roundId, data.advanced_stats);
    }

    // Update leaderboard
    await recalcLeaderboard(userId);

    return successResponse({ message: 'Round created', roundId: roundId.toString() }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/rounds error:', error);
    return errorResponse('Database error', 500);
  }
}

// Helper to recalculate round totals from hole-by-hole data
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

  // Get round's tee to calculate toPar
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      teeId: true,
      tee: {
        select: { parTotal: true },
      },
    },
  });

  const toPar = round?.tee?.parTotal ? totalScore - round.tee.parTotal : null;

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
      const values = holes.map((h: any) => h[field]).filter((v): v is number => v !== null);
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
