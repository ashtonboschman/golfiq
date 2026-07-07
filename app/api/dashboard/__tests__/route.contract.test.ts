import { GET } from '@/app/api/dashboard/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { isPremiumUser } from '@/lib/subscription';
import { resolveTeeContext } from '@/lib/tee/resolveTeeContext';
import { normalizeRoundsByMode, calculateHandicap } from '@/lib/utils/handicap';
import { ROUND_IDENTITY_V1_VERSION } from '@/lib/insights/roundIdentity/types';

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
    roundInsight: { findUnique: jest.fn() },
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
  roundInsight: { findUnique: jest.Mock };
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
    mockedPrisma.roundInsight.findUnique.mockResolvedValue(null);
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
    expect(body.latestRoundIdentity).toBeNull();
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

  it('returns normalized latestRoundIdentity summary when round insights exist', async () => {
    mockedPrisma.roundInsight.findUnique.mockResolvedValue({
      insights: {
        raw_payload: {
          round_identity_v1: {
            version: ROUND_IDENTITY_V1_VERSION,
            primaryKey: 'approach_carried',
            tone: 'repeat',
            confidence: 'strong',
            evidenceLevel: 'hole_by_hole',
          },
        },
      },
    });

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latestRoundIdentity).toEqual({
      primaryKey: 'approach_carried',
      tone: 'repeat',
      confidence: 'strong',
      evidenceLevel: 'hole_by_hole',
    });
  });

  it('ignores a stored latest-round identity from an older copy version', async () => {
    mockedPrisma.roundInsight.findUnique.mockResolvedValue({
      insights: {
        raw_payload: {
          round_identity_v1: {
            version: 'round_identity_v1.4.0',
            primaryKey: 'approach_carried',
            tone: 'repeat',
            confidence: 'strong',
            evidenceLevel: 'hole_by_hole',
          },
        },
      },
    });

    const response = await GET(new Request('http://localhost/api/dashboard?statsMode=combined') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latestRoundIdentity).toBeNull();
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

  it('returns derived short-game metrics with null-safe opportunity handling', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        ...makeDbRound(1),
        holeByHole: true,
        shortGameShots: 0,
      },
      {
        ...makeDbRound(2),
        holeByHole: true,
        shortGameShots: 6,
      },
    ]);

    mockedPrisma.roundHole.findMany.mockResolvedValue([
      // Scrambling + up-and-down + sand save success
      {
        roundId: BigInt(1),
        firHit: null,
        firDirection: null,
        girHit: 0,
        girDirection: null,
        score: 4,
        putts: 1,
        chips: 0,
        greensideBunkerShots: 1,
        hole: { par: 4 },
      },
      // Scrambling opportunity only (no up-and-down success: 2 short-game shots)
      {
        roundId: BigInt(2),
        firHit: null,
        firDirection: null,
        girHit: 0,
        girDirection: null,
        score: 4,
        putts: 1,
        chips: 2,
        greensideBunkerShots: 0,
        hole: { par: 4 },
      },
      // Up-and-down should be excluded (missing putts)
      {
        roundId: BigInt(2),
        firHit: null,
        firDirection: null,
        girHit: 0,
        girDirection: null,
        score: 5,
        putts: null,
        chips: 1,
        greensideBunkerShots: 0,
        hole: { par: 4 },
      },
      // Sand save opportunity + failure
      {
        roundId: BigInt(2),
        firHit: null,
        firDirection: null,
        girHit: 1,
        girDirection: null,
        score: 5,
        putts: 2,
        chips: 0,
        greensideBunkerShots: 2,
        hole: { par: 4 },
      },
      // Excluded from scrambling (missing par)
      {
        roundId: BigInt(2),
        firHit: null,
        firDirection: null,
        girHit: 0,
        girDirection: null,
        score: 4,
        putts: 1,
        chips: 1,
        greensideBunkerShots: 0,
        hole: { par: null },
      },
    ]);

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shortGameShotsAvg).toBe(3);
    expect(body.scramblingPct).toBeCloseTo(66.67, 2);
    expect(body.upAndDownPct).toBe(50);
    expect(body.sandSavePct).toBe(50);
  });

  it('returns null short-game metrics when there is no tracked denominator data', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        ...makeDbRound(1),
        holeByHole: true,
        shortGameShots: null,
      },
    ]);

    mockedPrisma.roundHole.findMany.mockResolvedValue([
      {
        roundId: BigInt(1),
        firHit: null,
        firDirection: null,
        girHit: 0,
        girDirection: null,
        score: null,
        putts: null,
        chips: null,
        greensideBunkerShots: null,
        hole: { par: 4 },
      },
    ]);

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shortGameShotsAvg).toBeNull();
    expect(body.scramblingPct).toBeNull();
    expect(body.upAndDownPct).toBeNull();
    expect(body.sandSavePct).toBeNull();
  });

  it('normalizes shortGameShotsAvg by stats mode (combined vs 9 vs 18)', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        ...makeDbRound(1),
        shortGameShots: 3,
        tee: { teeName: 'Front', __holes: 9 },
      },
      {
        ...makeDbRound(2),
        shortGameShots: 6,
        tee: { teeName: 'Blue', __holes: 18 },
      },
    ]);

    mockedResolveTeeContext.mockImplementation((tee: any) => ({
      holes: tee.__holes ?? 18,
      courseRating: (tee.__holes ?? 18) === 9 ? 36 : 72,
      slopeRating: 120,
      parTotal: (tee.__holes ?? 18) === 9 ? 36 : 72,
      nonPar3Holes: (tee.__holes ?? 18) === 9 ? 7 : 14,
    }));

    mockedNormalizeRoundsByMode.mockImplementation((rounds: any[], mode: 'combined' | '9' | '18') => {
      if (mode === '9') return rounds.filter((r) => r.holes === 9);
      if (mode === '18') return rounds.filter((r) => r.holes === 18);
      return rounds.map((r) => {
        if (r.holes !== 9) return r;
        return {
          ...r,
          holes: 18,
          score: r.score * 2,
          to_par: r.to_par != null ? r.to_par * 2 : null,
          net_score: r.net_score != null ? r.net_score * 2 : null,
          fir_hit: r.fir_hit != null ? r.fir_hit * 2 : null,
          fir_total: r.fir_total * 2,
          gir_hit: r.gir_hit != null ? r.gir_hit * 2 : null,
          gir_total: r.gir_total * 2,
          putts: r.putts != null ? r.putts * 2 : null,
          penalties: r.penalties != null ? r.penalties * 2 : null,
          short_game_shots: r.short_game_shots != null ? r.short_game_shots * 2 : null,
          rating: r.rating * 2,
          par: r.par * 2,
        };
      });
    });
    mockedPrisma.roundHole.findMany.mockResolvedValue([]);

    const combinedResponse = await GET(new Request('http://localhost/api/dashboard?statsMode=combined') as any);
    const combinedBody = await combinedResponse.json();
    expect(combinedResponse.status).toBe(200);
    expect(combinedBody.shortGameShotsAvg).toBe(6);

    const nineResponse = await GET(new Request('http://localhost/api/dashboard?statsMode=9') as any);
    const nineBody = await nineResponse.json();
    expect(nineResponse.status).toBe(200);
    expect(nineBody.shortGameShotsAvg).toBe(3);

    const eighteenResponse = await GET(new Request('http://localhost/api/dashboard?statsMode=18') as any);
    const eighteenBody = await eighteenResponse.json();
    expect(eighteenResponse.status).toBe(200);
    expect(eighteenBody.shortGameShotsAvg).toBe(6);
  });

  it('builds combined scoring_profile from round-grouped data and doubles only 9-hole rounds', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        id: BigInt(101),
        userId: BigInt(1),
        date: new Date('2026-02-10T12:00:00.000Z'),
        updatedAt: new Date('2026-02-10T13:00:00.000Z'),
        teeSegment: 'full',
        score: 40,
        toPar: 4,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: {
          teeName: 'Front',
          __holes: 9,
        },
        course: {
          clubName: 'Club',
          courseName: 'Course',
          location: { city: 'City', state: 'ST', address: 'Address' },
        },
      },
      {
        id: BigInt(102),
        userId: BigInt(1),
        date: new Date('2026-02-11T12:00:00.000Z'),
        updatedAt: new Date('2026-02-11T13:00:00.000Z'),
        teeSegment: 'full',
        score: 84,
        toPar: 12,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: {
          teeName: 'Blue',
          __holes: 18,
        },
        course: {
          clubName: 'Club',
          courseName: 'Course',
          location: { city: 'City', state: 'ST', address: 'Address' },
        },
      },
    ]);
    mockedResolveTeeContext.mockImplementation((tee: any) => ({
      holes: tee.__holes,
      courseRating: tee.__holes === 9 ? 36 : 72,
      slopeRating: 120,
      parTotal: tee.__holes === 9 ? 36 : 72,
      nonPar3Holes: tee.__holes === 9 ? 7 : 14,
    }));
    mockedNormalizeRoundsByMode.mockImplementation((rounds: any[], mode: 'combined' | '9' | '18') => {
      if (mode === '9') return rounds.filter((r) => r.holes === 9);
      if (mode === '18') return rounds.filter((r) => r.holes === 18);
      return rounds.map((r) => {
        if (r.holes !== 9) return r;
        return {
          ...r,
          holes: 18,
          score: r.score * 2,
          to_par: r.to_par != null ? r.to_par * 2 : null,
          net_score: r.net_score != null ? r.net_score * 2 : null,
          fir_hit: r.fir_hit != null ? r.fir_hit * 2 : null,
          fir_total: r.fir_total * 2,
          gir_hit: r.gir_hit != null ? r.gir_hit * 2 : null,
          gir_total: r.gir_total * 2,
          putts: r.putts != null ? r.putts * 2 : null,
          penalties: r.penalties != null ? r.penalties * 2 : null,
          rating: r.rating * 2,
          par: r.par * 2,
        };
      });
    });
    mockedPrisma.roundHole.findMany.mockResolvedValue([
      // Round 101 (9 holes): birdie+ 2, par 3, bogey 2, double 2
      { roundId: BigInt(101), score: 3, hole: { par: 4 } }, // birdie
      { roundId: BigInt(101), score: 2, hole: { par: 4 } }, // eagle
      { roundId: BigInt(101), score: 4, hole: { par: 4 } }, // par
      { roundId: BigInt(101), score: 4, hole: { par: 4 } }, // par
      { roundId: BigInt(101), score: 3, hole: { par: 3 } }, // par
      { roundId: BigInt(101), score: 5, hole: { par: 4 } }, // bogey
      { roundId: BigInt(101), score: 6, hole: { par: 5 } }, // bogey
      { roundId: BigInt(101), score: 6, hole: { par: 4 } }, // double
      { roundId: BigInt(101), score: 7, hole: { par: 5 } }, // double

      // Round 102 (18 holes): birdie+ 3, par 9, bogey 4, double 1, triple+ 1
      { roundId: BigInt(102), score: 3, hole: { par: 4 } }, // birdie
      { roundId: BigInt(102), score: 3, hole: { par: 5 } }, // eagle
      { roundId: BigInt(102), score: 1, hole: { par: 3 } }, // ace
      { roundId: BigInt(102), score: 4, hole: { par: 4 } },
      { roundId: BigInt(102), score: 4, hole: { par: 4 } },
      { roundId: BigInt(102), score: 4, hole: { par: 4 } },
      { roundId: BigInt(102), score: 5, hole: { par: 5 } },
      { roundId: BigInt(102), score: 3, hole: { par: 3 } },
      { roundId: BigInt(102), score: 3, hole: { par: 3 } },
      { roundId: BigInt(102), score: 4, hole: { par: 4 } },
      { roundId: BigInt(102), score: 5, hole: { par: 5 } },
      { roundId: BigInt(102), score: 4, hole: { par: 4 } },
      { roundId: BigInt(102), score: 5, hole: { par: 4 } }, // bogey
      { roundId: BigInt(102), score: 6, hole: { par: 5 } }, // bogey
      { roundId: BigInt(102), score: 4, hole: { par: 3 } }, // bogey
      { roundId: BigInt(102), score: 5, hole: { par: 4 } }, // bogey
      { roundId: BigInt(102), score: 6, hole: { par: 4 } }, // double
      { roundId: BigInt(102), score: 8, hole: { par: 5 } }, // triple+
    ]);

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.scoring_profile.normalized_counts).toEqual({
      birdie_plus: 7,
      par: 15,
      bogey: 8,
      double: 5,
      triple_plus: 1,
    });
    expect(body.scoring_profile.normalized_total_holes).toBe(36);
    expect(body.scoring_profile.percentages).toEqual({
      birdie_plus: 19.44,
      par: 41.67,
      bogey: 22.22,
      double: 13.89,
      triple_plus: 2.78,
    });
    expect(body.scoring_profile.averages_per_round).toEqual({
      birdie_plus: 3.5,
      par: 7.5,
      bogey: 4,
      double: 2.5,
      triple_plus: 0.5,
    });
    expect(body.scoring_profile.source_round_count).toBe(2);
    expect(body.scoring_profile.normalization).toBe('combined_18_equivalent');
    expect(mockedPrisma.round.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roundContext: 'real',
        }),
      }),
    );
  });

  it('does not double in 9-hole mode and computes percentages from 9-hole totals', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        id: BigInt(201),
        userId: BigInt(1),
        date: new Date('2026-02-10T12:00:00.000Z'),
        updatedAt: new Date('2026-02-10T13:00:00.000Z'),
        teeSegment: 'full',
        score: 40,
        toPar: 4,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: { teeName: 'Front', __holes: 9 },
        course: { clubName: 'Club', courseName: 'Course', location: { city: 'City', state: 'ST', address: 'Address' } },
      },
      {
        id: BigInt(202),
        userId: BigInt(1),
        date: new Date('2026-02-11T12:00:00.000Z'),
        updatedAt: new Date('2026-02-11T13:00:00.000Z'),
        teeSegment: 'full',
        score: 84,
        toPar: 12,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: { teeName: 'Blue', __holes: 18 },
        course: { clubName: 'Club', courseName: 'Course', location: { city: 'City', state: 'ST', address: 'Address' } },
      },
    ]);
    mockedResolveTeeContext.mockImplementation((tee: any) => ({
      holes: tee.__holes,
      courseRating: tee.__holes === 9 ? 36 : 72,
      slopeRating: 120,
      parTotal: tee.__holes === 9 ? 36 : 72,
      nonPar3Holes: tee.__holes === 9 ? 7 : 14,
    }));
    mockedNormalizeRoundsByMode.mockImplementation((rounds: any[], mode: 'combined' | '9' | '18') => {
      if (mode === '9') return rounds.filter((r) => r.holes === 9);
      if (mode === '18') return rounds.filter((r) => r.holes === 18);
      return rounds;
    });
    mockedPrisma.roundHole.findMany.mockResolvedValue([
      { roundId: BigInt(201), score: 3, hole: { par: 4 } },
      { roundId: BigInt(201), score: 2, hole: { par: 4 } },
      { roundId: BigInt(201), score: 4, hole: { par: 4 } },
      { roundId: BigInt(201), score: 4, hole: { par: 4 } },
      { roundId: BigInt(201), score: 3, hole: { par: 3 } },
      { roundId: BigInt(201), score: 5, hole: { par: 4 } },
      { roundId: BigInt(201), score: 6, hole: { par: 5 } },
      { roundId: BigInt(201), score: 6, hole: { par: 4 } },
      { roundId: BigInt(201), score: 9, hole: { par: 5 } },
    ]);

    const request = new Request('http://localhost/api/dashboard?statsMode=9');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scoring_profile.normalized_counts).toEqual({
      birdie_plus: 2,
      par: 3,
      bogey: 2,
      double: 1,
      triple_plus: 1,
    });
    expect(body.scoring_profile.normalized_total_holes).toBe(9);
    expect(body.scoring_profile.percentages).toEqual({
      birdie_plus: 22.22,
      par: 33.33,
      bogey: 22.22,
      double: 11.11,
      triple_plus: 11.11,
    });
    expect(body.scoring_profile.averages_per_round).toEqual({
      birdie_plus: 2,
      par: 3,
      bogey: 2,
      double: 1,
      triple_plus: 1,
    });
    expect(body.scoring_profile.normalization).toBe('nine_hole');
  });

  it('does not double in 18-hole mode and computes percentages from 18-hole totals', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        id: BigInt(301),
        userId: BigInt(1),
        date: new Date('2026-02-11T12:00:00.000Z'),
        updatedAt: new Date('2026-02-11T13:00:00.000Z'),
        teeSegment: 'full',
        score: 84,
        toPar: 12,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: { teeName: 'Blue', __holes: 18 },
        course: { clubName: 'Club', courseName: 'Course', location: { city: 'City', state: 'ST', address: 'Address' } },
      },
      {
        id: BigInt(302),
        userId: BigInt(1),
        date: new Date('2026-02-10T12:00:00.000Z'),
        updatedAt: new Date('2026-02-10T13:00:00.000Z'),
        teeSegment: 'full',
        score: 40,
        toPar: 4,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: { teeName: 'Front', __holes: 9 },
        course: { clubName: 'Club', courseName: 'Course', location: { city: 'City', state: 'ST', address: 'Address' } },
      },
    ]);
    mockedResolveTeeContext.mockImplementation((tee: any) => ({
      holes: tee.__holes,
      courseRating: tee.__holes === 9 ? 36 : 72,
      slopeRating: 120,
      parTotal: tee.__holes === 9 ? 36 : 72,
      nonPar3Holes: tee.__holes === 9 ? 7 : 14,
    }));
    mockedNormalizeRoundsByMode.mockImplementation((rounds: any[], mode: 'combined' | '9' | '18') => {
      if (mode === '9') return rounds.filter((r) => r.holes === 9);
      if (mode === '18') return rounds.filter((r) => r.holes === 18);
      return rounds;
    });
    mockedPrisma.roundHole.findMany.mockResolvedValue([
      { roundId: BigInt(301), score: 3, hole: { par: 4 } },
      { roundId: BigInt(301), score: 3, hole: { par: 5 } },
      { roundId: BigInt(301), score: 1, hole: { par: 3 } },
      { roundId: BigInt(301), score: 4, hole: { par: 4 } },
      { roundId: BigInt(301), score: 4, hole: { par: 4 } },
      { roundId: BigInt(301), score: 4, hole: { par: 4 } },
      { roundId: BigInt(301), score: 5, hole: { par: 5 } },
      { roundId: BigInt(301), score: 3, hole: { par: 3 } },
      { roundId: BigInt(301), score: 3, hole: { par: 3 } },
      { roundId: BigInt(301), score: 4, hole: { par: 4 } },
      { roundId: BigInt(301), score: 5, hole: { par: 5 } },
      { roundId: BigInt(301), score: 4, hole: { par: 4 } },
      { roundId: BigInt(301), score: 5, hole: { par: 4 } },
      { roundId: BigInt(301), score: 6, hole: { par: 5 } },
      { roundId: BigInt(301), score: 4, hole: { par: 3 } },
      { roundId: BigInt(301), score: 5, hole: { par: 4 } },
      { roundId: BigInt(301), score: 6, hole: { par: 4 } },
      { roundId: BigInt(301), score: 8, hole: { par: 5 } },
    ]);

    const request = new Request('http://localhost/api/dashboard?statsMode=18');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scoring_profile.normalized_counts).toEqual({
      birdie_plus: 3,
      par: 9,
      bogey: 4,
      double: 1,
      triple_plus: 1,
    });
    expect(body.scoring_profile.normalized_total_holes).toBe(18);
    expect(body.scoring_profile.percentages).toEqual({
      birdie_plus: 16.67,
      par: 50,
      bogey: 22.22,
      double: 5.56,
      triple_plus: 5.56,
    });
    expect(body.scoring_profile.averages_per_round).toEqual({
      birdie_plus: 3,
      par: 9,
      bogey: 4,
      double: 1,
      triple_plus: 1,
    });
    expect(body.scoring_profile.normalization).toBe('eighteen_hole');
  });

  it('returns safe zero scoring_profile percentages without NaN when no hole-by-hole data exists', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        id: BigInt(401),
        userId: BigInt(1),
        date: new Date('2026-02-11T12:00:00.000Z'),
        updatedAt: new Date('2026-02-11T13:00:00.000Z'),
        teeSegment: 'full',
        score: 84,
        toPar: 12,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        netScore: null,
        holeByHole: true,
        tee: { teeName: 'Blue', __holes: 18 },
        course: { clubName: 'Club', courseName: 'Course', location: { city: 'City', state: 'ST', address: 'Address' } },
      },
    ]);
    mockedResolveTeeContext.mockImplementation((tee: any) => ({
      holes: tee.__holes,
      courseRating: 72,
      slopeRating: 120,
      parTotal: 72,
      nonPar3Holes: 14,
    }));
    mockedNormalizeRoundsByMode.mockImplementation((rounds: any[]) => rounds);
    mockedPrisma.roundHole.findMany.mockResolvedValue([]);

    const request = new Request('http://localhost/api/dashboard?statsMode=combined');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scoring_profile.normalized_total_holes).toBe(0);
    expect(body.scoring_profile.normalized_counts).toEqual({
      birdie_plus: 0,
      par: 0,
      bogey: 0,
      double: 0,
      triple_plus: 0,
    });
    expect(body.scoring_profile.percentages).toEqual({
      birdie_plus: 0,
      par: 0,
      bogey: 0,
      double: 0,
      triple_plus: 0,
    });
    expect(body.scoring_profile.averages_per_round).toEqual({
      birdie_plus: 0,
      par: 0,
      bogey: 0,
      double: 0,
      triple_plus: 0,
    });
    expect(Number.isFinite(body.scoring_profile.percentages.birdie_plus)).toBe(true);
    expect(Number.isFinite(body.scoring_profile.percentages.par)).toBe(true);
    expect(Number.isFinite(body.scoring_profile.percentages.bogey)).toBe(true);
    expect(Number.isFinite(body.scoring_profile.percentages.double)).toBe(true);
    expect(Number.isFinite(body.scoring_profile.percentages.triple_plus)).toBe(true);
  });
});
