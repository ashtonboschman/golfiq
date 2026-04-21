import { GET, PUT } from '@/app/api/rounds/[id]/route';
import { requireAuth } from '@/lib/api-auth';
import { captureServerEvent } from '@/lib/analytics/server';
import { prisma } from '@/lib/db';
import { generateAndStoreOverallInsights } from '@/app/api/insights/overall/route';
import { generateInsights } from '@/app/api/rounds/[id]/insights/route';
import { calculateNetScore } from '@/lib/utils/handicap';
import { recalcLeaderboard } from '@/lib/utils/leaderboard';
import { calculateStrokesGained } from '@/lib/utils/strokesGained';
import { resolveTeeContext } from '@/lib/tee/resolveTeeContext';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    round: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    tee: {
      findUnique: jest.fn(),
    },
    roundHole: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    roundStrokesGained: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    roundInsight: {
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn(),
}));

jest.mock('@/lib/utils/leaderboard', () => ({
  recalcLeaderboard: jest.fn(),
}));

jest.mock('@/lib/utils/handicap', () => ({
  calculateNetScore: jest.fn(),
}));

jest.mock('@/lib/utils/strokesGained', () => ({
  calculateStrokesGained: jest.fn(),
}));

jest.mock('@/lib/tee/resolveTeeContext', () => ({
  resolveTeeContext: jest.fn(),
}));

jest.mock('@/app/api/insights/overall/route', () => ({
  generateAndStoreOverallInsights: jest.fn(),
}));

jest.mock('@/app/api/rounds/[id]/insights/route', () => ({
  generateInsights: jest.fn(),
}));

type MockPrisma = {
  round: {
    findFirst: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  tee: {
    findUnique: jest.Mock;
  };
  roundHole: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
  roundStrokesGained: {
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  roundInsight: {
    deleteMany: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedCaptureServerEvent = captureServerEvent as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedResolveTeeContext = resolveTeeContext as jest.Mock;
const mockedCalculateNetScore = calculateNetScore as jest.Mock;
const mockedCalculateStrokesGained = calculateStrokesGained as jest.Mock;
const mockedRecalcLeaderboard = recalcLeaderboard as jest.Mock;
const mockedGenerateOverall = generateAndStoreOverallInsights as jest.Mock;
const mockedGenerateInsights = generateInsights as jest.Mock;

function params(id: string) {
  return { params: Promise.resolve({ id }) } as any;
}

describe('/api/rounds/[id] route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedResolveTeeContext.mockReturnValue({
      holes: 18,
      parTotal: 72,
      nonPar3Holes: 14,
      courseRating: 72.1,
      slopeRating: 123,
    });
    mockedCalculateNetScore.mockReturnValue({ netScore: 75, netToPar: 3 });
    mockedCalculateStrokesGained.mockResolvedValue({
      sgTotal: 0.4,
      sgOffTee: 0.2,
      sgApproach: 0.1,
      sgPutting: 0.1,
      sgPenalties: -0.1,
      sgResidual: 0.1,
      confidence: 'medium',
      messages: ['ok'],
      partialAnalysis: false,
    });

    mockedPrisma.tee.findUnique.mockResolvedValue({ id: BigInt(12), holes: [] });
    mockedPrisma.round.update.mockResolvedValue({});
    mockedPrisma.round.findUnique.mockResolvedValue({ score: 78, teeId: BigInt(12), handicapAtRound: 2.1 });
    mockedPrisma.roundStrokesGained.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.roundInsight.deleteMany.mockResolvedValue({ count: 1 });
    mockedRecalcLeaderboard.mockResolvedValue(undefined);
    mockedGenerateInsights.mockResolvedValue(undefined);
    mockedGenerateOverall.mockResolvedValue(undefined);
    mockedCaptureServerEvent.mockResolvedValue(undefined);
  });

  it('GET serializes round_context and falls back null to real', async () => {
    mockedPrisma.round.findFirst.mockResolvedValue({
      id: BigInt(9),
      userId: BigInt(1),
      courseId: BigInt(11),
      teeId: BigInt(12),
      holeByHole: false,
      holesPlayed: 18,
      roundContext: null,
      toPar: 6,
      teeSegment: 'full',
      date: new Date('2026-04-20T12:00:00.000Z'),
      score: 78,
      firHit: 8,
      girHit: 9,
      putts: 31,
      penalties: 1,
      notes: null,
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      updatedAt: new Date('2026-04-20T12:00:00.000Z'),
      course: {
        courseName: 'Course',
        clubName: 'Club',
        location: { city: 'City', state: 'ST', address: 'Address' },
      },
      tee: {
        teeName: 'Blue',
        gender: 'male',
        parTotal: 72,
        numberOfHoles: 18,
      },
    });

    const request = new Request('http://localhost/api/rounds/9');
    const response = await GET(request as any, params('9'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.round.round_context).toBe('real');
  });

  it('PUT uses provided round_context when present', async () => {
    mockedPrisma.round.findFirst.mockResolvedValue({
      date: new Date('2026-04-20T12:00:00.000Z'),
      courseId: BigInt(11),
      teeId: BigInt(12),
      teeSegment: 'full',
      roundContext: 'real',
      holeByHole: false,
      score: 78,
      firHit: 8,
      girHit: 9,
      putts: 31,
      penalties: 1,
      notes: null,
    });

    const request = new Request('http://localhost/api/rounds/9', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 79,
        hole_by_hole: 0,
        round_context: 'practice',
      }),
    });

    const response = await PUT(request as any, params('9'));
    expect(response.status).toBe(200);

    expect(mockedPrisma.round.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roundContext: 'practice',
        }),
      }),
    );
  });

  it('PUT preserves existing round_context when omitted', async () => {
    mockedPrisma.round.findFirst.mockResolvedValue({
      date: new Date('2026-04-20T12:00:00.000Z'),
      courseId: BigInt(11),
      teeId: BigInt(12),
      teeSegment: 'full',
      roundContext: 'simulator',
      holeByHole: false,
      score: 78,
      firHit: 8,
      girHit: 9,
      putts: 31,
      penalties: 1,
      notes: null,
    });

    const request = new Request('http://localhost/api/rounds/9', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 79,
        hole_by_hole: 0,
      }),
    });

    const response = await PUT(request as any, params('9'));
    expect(response.status).toBe(200);

    expect(mockedPrisma.round.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roundContext: 'simulator',
        }),
      }),
    );
  });
});
