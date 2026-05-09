import { GET } from '@/app/api/dashboard/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { isPremiumUser } from '@/lib/subscription';
import { resolveTeeContext } from '@/lib/tee/resolveTeeContext';
import { normalizeRoundsByMode, calculateHandicap } from '@/lib/utils/handicap';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    userProfile: { findUnique: jest.fn() },
    friend: { findFirst: jest.fn() },
    round: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    roundHole: { findMany: jest.fn() },
    overallInsight: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/subscription', () => ({
  isPremiumUser: jest.fn(),
}));

jest.mock('@/lib/tee/resolveTeeContext', () => ({
  resolveTeeContext: jest.fn(),
}));

jest.mock('@/lib/utils/handicap', () => ({
  normalizeRoundsByMode: jest.fn(),
  calculateHandicap: jest.fn(),
}));

type MockPrisma = {
  userProfile: { findUnique: jest.Mock };
  friend: { findFirst: jest.Mock };
  round: { findMany: jest.Mock };
  user: { findUnique: jest.Mock };
  roundHole: { findMany: jest.Mock };
  overallInsight: { findUnique: jest.Mock };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedIsPremiumUser = isPremiumUser as jest.Mock;
const mockedResolveTeeContext = resolveTeeContext as jest.Mock;
const mockedNormalizeRoundsByMode = normalizeRoundsByMode as jest.Mock;
const mockedCalculateHandicap = calculateHandicap as jest.Mock;

function makeDbRound(index: number) {
  const day = String(index).padStart(2, '0');
  return {
    id: BigInt(index),
    userId: BigInt(1),
    date: new Date(`2026-01-${day}T12:00:00.000Z`),
    updatedAt: new Date(`2026-01-${day}T13:00:00.000Z`),
    teeSegment: 'full',
    score: index, // 1..25
    toPar: index - 72,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
    netScore: null,
    holeByHole: false,
    tee: {
      teeName: 'Blue',
    },
    course: {
      clubName: 'Club',
      courseName: 'Course',
      location: {
        city: 'City',
        state: 'ST',
        address: 'Address',
      },
    },
  };
}

describe('/api/dashboard route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.userProfile.findUnique.mockResolvedValue({
      dashboardVisibility: 'public',
      firstName: 'Test',
      lastName: 'User',
    });
    mockedPrisma.round.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => makeDbRound(i + 1)),
    );
    mockedPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'free' });
    mockedIsPremiumUser.mockReturnValue(false);
    mockedResolveTeeContext.mockReturnValue({
      holes: 18,
      courseRating: 72.0,
      slopeRating: 120,
      parTotal: 72,
      nonPar3Holes: 14,
    });
    mockedNormalizeRoundsByMode.mockImplementation((rounds: any[]) => rounds);
    mockedPrisma.roundHole.findMany.mockResolvedValue([]);
    mockedCalculateHandicap.mockReturnValue(10.2);
    mockedPrisma.overallInsight.findUnique.mockResolvedValue(null);
  });

  it('caps free-user aggregate averages to the latest 20 rounds', async () => {
    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');

    // Full mode count is still returned.
    expect(body.total_rounds).toBe(25);
    // But free-tier stats are based on capped latest 20 (scores 6..25 => average 15.5).
    expect(body.average_score).toBe(15.5);
    expect(body.all_rounds).toHaveLength(20);
    expect(body.limitedToLast20).toBe(true);
    expect(body.totalRoundsInDb).toBe(25);
    expect(mockedPrisma.round.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: BigInt(1),
          roundContext: 'real',
        }),
      }),
    );

    // Ensure handicap is also computed from the capped set.
    expect(mockedCalculateHandicap).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ score: 25 }),
        expect.objectContaining({ score: 6 }),
      ]),
    );
    const handicapInput = mockedCalculateHandicap.mock.calls[0][0];
    expect(handicapInput).toHaveLength(20);
  });

  it('preserves persistence and volatility signals in overallInsightsSummary contract', async () => {
    mockedPrisma.overallInsight.findUnique.mockResolvedValue({
      insights: {
        generated_at: '2026-02-24T10:00:00.000Z',
        tier_context: { recentWindow: 5 },
        projection: { projectedHandicapIn10: 7.2 },
        projection_by_mode: {
          combined: {
            projectedScoreIn10: 79.3,
            scoreLow: 78.1,
            scoreHigh: 80.5,
          },
          '9': { projectedScoreIn10: null, scoreLow: null, scoreHigh: null },
          '18': { projectedScoreIn10: null, scoreLow: null, scoreHigh: null },
        },
        mode_payload: {
          combined: {
            kpis: {
              roundsRecent: 5,
              avgScoreRecent: 80.2,
              avgScoreBaseline: 79.0,
              deltaVsBaseline: 1.2,
            },
            consistency: { label: 'volatile', stdDev: 4.3 },
            sgComponents: {
              hasData: true,
              recentAvg: {
                offTee: -0.1,
                approach: -0.3,
                putting: -0.2,
                penalties: -0.05,
                residual: 0,
              },
              baselineAvg: {
                offTee: 0,
                approach: 0,
                putting: 0,
                penalties: 0,
                residual: 0,
              },
            },
            efficiency: {
              fir: { recent: 0.5, baseline: 0.5, coverageRecent: '5/5' },
              gir: { recent: 0.4, baseline: 0.4, coverageRecent: '5/5' },
              puttsTotal: { recent: 32, baseline: 32, coverageRecent: '5/5' },
              penaltiesPerRound: { recent: 1.4, baseline: 1.2, coverageRecent: '5/5' },
            },
          },
          '9': { kpis: { roundsRecent: 0 } },
          '18': { kpis: { roundsRecent: 5 } },
        },
        sg: {
          components: {
            latest: { confidence: 'high' },
            worstComponentFrequencyRecent: {
              component: 'approach',
              count: 4,
              window: 5,
            },
          },
        },
      },
    });

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.overallInsightsSummary).toEqual(
      expect.objectContaining({
        confidence: 'high',
        dataQualityFlags: expect.objectContaining({
          volatileScoring: true,
        }),
        persistenceSignal: {
          component: 'approach',
          count: 4,
          window: 5,
          tier: 'persistent',
        },
      }),
    );
  });

  it('returns FIR/GIR miss tendencies percentages from directional misses', async () => {
    mockedPrisma.roundHole.findMany.mockResolvedValue([
      { roundId: BigInt(25), firHit: 0, firDirection: 'miss_left', girHit: 0, girDirection: 'miss_short', hole: { par: 4 }, score: 5 },
      { roundId: BigInt(24), firHit: 0, firDirection: 'miss_right', girHit: 0, girDirection: 'miss_short', hole: { par: 4 }, score: 5 },
      { roundId: BigInt(23), firHit: 0, firDirection: 'miss_right', girHit: 0, girDirection: 'miss_long', hole: { par: 5 }, score: 6 },
      { roundId: BigInt(22), firHit: 0, firDirection: null, girHit: 0, girDirection: null, hole: { par: 4 }, score: 5 },
    ]);

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.miss_tendencies).toEqual(
      expect.objectContaining({
        labels: ['Left', 'Right', 'Short', 'Long'],
        fir: expect.objectContaining({
          counts: [1, 2, 0, 0],
          tracked_misses: 3,
          total_misses: 4,
          untracked_misses: 1,
        }),
        gir: expect.objectContaining({
          counts: [0, 0, 2, 1],
          tracked_misses: 3,
          total_misses: 4,
          untracked_misses: 1,
        }),
      }),
    );
    expect(body.miss_tendencies.fir.percentages[0]).toBeCloseTo(33.333, 2);
    expect(body.miss_tendencies.fir.percentages[1]).toBeCloseTo(66.666, 2);
    expect(body.miss_tendencies.gir.percentages[2]).toBeCloseTo(66.666, 2);
    expect(body.miss_tendencies.gir.percentages[3]).toBeCloseTo(33.333, 2);
  });
});
