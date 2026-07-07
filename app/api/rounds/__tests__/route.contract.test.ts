import { GET, POST } from '@/app/api/rounds/route';
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
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    tee: {
      findUnique: jest.fn(),
    },
    roundStrokesGained: {
      create: jest.fn(),
    },
    roundHole: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    userLeaderboardStats: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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
    findMany: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  tee: {
    findUnique: jest.Mock;
  };
  roundStrokesGained: {
    create: jest.Mock;
  };
  roundHole: {
    findMany: jest.Mock;
    createMany: jest.Mock;
  };
  userLeaderboardStats: {
    findUnique: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
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

function makeListRound(roundContext: 'real' | 'simulator' | null) {
  return {
    id: BigInt(10),
    userId: BigInt(1),
    courseId: BigInt(11),
    teeId: BigInt(12),
    holeByHole: false,
    holesPlayed: 18,
    roundContext,
    toPar: 5,
    teeSegment: 'full',
    date: new Date('2026-04-20T12:00:00.000Z'),
    score: 77,
    netScore: 74,
    firHit: 8,
    girHit: 9,
    putts: 31,
    penalties: 1,
    chips: 4,
    greensideBunkerShots: 2,
    shortGameShots: 6,
    notes: null,
    createdAt: new Date('2026-04-20T12:00:00.000Z'),
    updatedAt: new Date('2026-04-20T12:00:00.000Z'),
    course: {
      courseName: 'Course',
      clubName: 'Club',
      location: {
        city: 'City',
        state: 'ST',
        address: 'Address',
      },
    },
    tee: {
      teeName: 'Blue',
      gender: 'male',
      parTotal: 72,
      numberOfHoles: 18,
    },
  };
}

describe('/api/rounds route contract', () => {
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
      sgShortGame: -0.2,
      sgPutting: 0.1,
      sgPenalties: -0.1,
      sgResidual: 0.1,
      confidence: 'medium',
      messages: ['ok'],
      partialAnalysis: false,
    });
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue({ handicap: 2.1 });
    mockedPrisma.tee.findUnique.mockResolvedValue({ id: BigInt(12), holes: [] });
    mockedPrisma.round.create.mockResolvedValue({ id: BigInt(222) });
    mockedPrisma.round.findUnique.mockResolvedValue({
      holesPlayed: 18,
      holeByHole: false,
      firHit: 8,
      girHit: 9,
      putts: 31,
      penalties: 1,
      chips: null,
      greensideBunkerShots: null,
      shortGameShots: null,
    });
    mockedPrisma.round.count.mockResolvedValue(1);
    mockedPrisma.roundStrokesGained.create.mockResolvedValue({});
    mockedRecalcLeaderboard.mockResolvedValue(undefined);
    mockedPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'free' });
    mockedGenerateInsights.mockResolvedValue(undefined);
    mockedGenerateOverall.mockResolvedValue(undefined);
    mockedCaptureServerEvent.mockResolvedValue(undefined);
  });

  it('GET serializes round_context and falls back null to real', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      makeListRound(null),
      makeListRound('simulator'),
    ]);

    const request = new Request('http://localhost/api/rounds?limit=20&page=1');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.rounds).toHaveLength(2);
    expect(body.rounds[0].round_context).toBe('real');
    expect(body.rounds[1].round_context).toBe('simulator');
  });

  it('POST defaults round_context to real when omitted', async () => {
    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 78,
        fir_hit: 8,
        gir_hit: 9,
        putts: 31,
        penalties: 1,
        notes: 'good',
        hole_by_hole: 0,
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.type).toBe('success');
    expect(mockedPrisma.round.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roundContext: 'real',
        }),
      }),
    );
    expect(mockedPrisma.round.count).toHaveBeenCalledWith({
      where: { userId: BigInt(1), roundContext: 'real' },
    });
    expect(mockedGenerateInsights).toHaveBeenCalledWith(BigInt(222), BigInt(1));
  });

  it('POST persists explicit simulator round_context', async () => {
    mockedPrisma.round.count.mockResolvedValue(2);

    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 80,
        round_context: 'simulator',
        hole_by_hole: 0,
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.round.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roundContext: 'simulator',
        }),
      }),
    );
    expect(mockedPrisma.round.count).toHaveBeenCalledWith({
      where: { userId: BigInt(1), roundContext: 'real' },
    });
  });

  it('keeps a completed round successful when post-round insight generation fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGenerateInsights.mockRejectedValueOnce(new Error('temporary insight failure'));

    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 80,
        hole_by_hole: 0,
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedGenerateInsights).toHaveBeenCalledWith(BigInt(222), BigInt(1));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to generate insights:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('POST hole-by-hole works when direction fields are omitted', async () => {
    mockedPrisma.round.findUnique.mockResolvedValueOnce(null);
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 1,
      parTotal: 4,
      nonPar3Holes: 1,
      courseRating: 72.1,
      slopeRating: 123,
    });

    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        hole_by_hole: 1,
        round_holes: [
          { hole_id: 101, pass: 1, score: 4, fir_hit: 1, gir_hit: 0, putts: 2, penalties: 0 },
        ],
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.roundHole.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            firHit: 1,
            girHit: 0,
            firDirection: null,
            girDirection: null,
          }),
        ],
      }),
    );
  });

  it('POST hole-by-hole normalizes inconsistent direction input and preserves valid miss directions', async () => {
    mockedPrisma.round.findUnique.mockResolvedValueOnce(null);
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 2,
      parTotal: 8,
      nonPar3Holes: 2,
      courseRating: 72.1,
      slopeRating: 123,
    });

    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        hole_by_hole: 1,
        round_holes: [
          {
            hole_id: 101,
            pass: 1,
            score: 5,
            fir_hit: 1,
            fir_direction: 'miss_left',
            gir_hit: 0,
            gir_direction: 'miss_right',
            putts: 2,
            penalties: 1,
          },
          {
            hole_id: 102,
            pass: 1,
            score: 4,
            fir_hit: 0,
            fir_direction: 'hit',
            gir_hit: null,
            gir_direction: 'miss_short',
            putts: 2,
            penalties: 0,
          },
        ],
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.roundHole.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            firHit: 1,
            firDirection: null,
            girHit: 0,
            girDirection: 'miss_right',
          }),
          expect.objectContaining({
            firHit: 0,
            firDirection: null,
            girHit: null,
            girDirection: null,
          }),
        ],
      }),
    );
  });

  it('POST rejects completed hole-by-hole rounds with unfinished hole scores', async () => {
    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        hole_by_hole: 1,
        round_holes: [
          { hole_id: 101, pass: 1, score: null, putts: 2 },
        ],
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/score is required for every hole/i);
    expect(mockedPrisma.round.create).not.toHaveBeenCalled();
    expect(mockedPrisma.roundHole.createMany).not.toHaveBeenCalled();
  });

  it('POST derives short_game_shots from chips and greenside_bunker_shots for after-round payloads', async () => {
    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 79,
        chips: 5,
        greenside_bunker_shots: null,
        hole_by_hole: 0,
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.round.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chips: 5,
          greensideBunkerShots: null,
          shortGameShots: 5,
        }),
      }),
    );
  });

  it('POST rejects round-level chips greater than 99', async () => {
    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        score: 79,
        chips: 100,
        hole_by_hole: 0,
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
    expect(mockedPrisma.round.create).not.toHaveBeenCalled();
  });

  it('POST rejects hole-level greenside_bunker_shots greater than 6', async () => {
    const request = new Request('http://localhost/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: 11,
        tee_id: 12,
        date: '2026-04-20',
        hole_by_hole: 1,
        round_holes: [
          {
            hole_id: 101,
            pass: 1,
            score: 4,
            greenside_bunker_shots: 7,
          },
        ],
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
    expect(mockedPrisma.roundHole.createMany).not.toHaveBeenCalled();
  });
});
