import { GET, generateAndStoreOverallInsights } from '@/app/api/insights/overall/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userLeaderboardStats: { findUnique: jest.fn() },
    round: { findMany: jest.fn() },
    overallInsight: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));

type MockPrisma = {
  user: { findUnique: jest.Mock };
  userLeaderboardStats: { findUnique: jest.Mock };
  round: { findMany: jest.Mock };
  overallInsight: { findUnique: jest.Mock; upsert: jest.Mock };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;

function makeTee() {
  return {
    numberOfHoles: 18,
    courseRating: 72.1,
    slopeRating: 130,
    bogeyRating: 95.4,
    parTotal: 72,
    nonPar3Holes: 14,
    frontCourseRating: 36.0,
    frontSlopeRating: 65,
    frontBogeyRating: 47.7,
    backCourseRating: 36.1,
    backSlopeRating: 65,
    backBogeyRating: 47.7,
    holes: Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      par: i % 3 === 0 ? 3 : 4,
    })),
  };
}

function makeRound(index: number) {
  const day = String(30 - index).padStart(2, '0');
  return {
    id: BigInt(index + 1),
    userId: BigInt(1),
    date: new Date(`2026-01-${day}T12:00:00.000Z`),
    teeSegment: 'full',
    score: 78 + (index % 3),
    toPar: 6 + (index % 3),
    firHit: 8,
    girHit: 9,
    putts: 33 + (index % 2),
    penalties: 1 + (index % 2),
    handicapAtRound: 3.4 - index * 0.05,
    tee: makeTee(),
    roundHoles: [{ penalties: 1 }],
    roundStrokesGained: {
      sgTotal: 0.4 - index * 0.1,
      sgOffTee: 0.2 - index * 0.1,
      sgApproach: 0.1 - index * 0.1,
      sgPutting: 0.1 - index * 0.1,
      sgPenalties: -0.1 + index * 0.1,
      sgResidual: 0.1 - index * 0.1,
      confidence: 'medium',
      partialAnalysis: false,
    },
  };
}

describe('/api/insights/overall contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.round.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => makeRound(i)));
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue({ handicap: 3.4 });
    mockedPrisma.overallInsight.findUnique.mockResolvedValue(null);
    mockedPrisma.overallInsight.upsert.mockResolvedValue({});
  });

  it('returns free-tier locked insights shape with selected mode', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
    });

    const request = new Request('http://localhost/api/insights/overall?statsMode=9');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.selectedMode).toBe('9');
    expect(body.insights.tier_context.isPremium).toBe(false);
    expect(body.insights.sg_locked).toBe(true);
    expect(body.insights.sg).toBeTruthy();
    expect(body.insights.sg.trend.sgTotal.length).toBeGreaterThan(0);
    expect(body.insights.cards).toHaveLength(6);
    expect(body.insights.mode_payload.combined.kpis.avgSgTotalRecent).toBeNull();
    expect(body.insights.projection.projectedScoreIn10).toBeNull();
    expect(body.insights.projection.projectedHandicapIn10).toBeNull();
    expect(body.insights.projection_by_mode.combined.projectedScoreIn10).toBeNull();
    expect(body.insights.projection_ranges).toBeUndefined();
  });

  it('returns premium unlocked insights shape with mode payload/projections', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
    });

    const request = new Request('http://localhost/api/insights/overall?statsMode=18');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.selectedMode).toBe('18');
    expect(body.insights.tier_context.isPremium).toBe(true);
    expect(body.insights.sg_locked).toBe(false);
    expect(body.insights.sg).toBeTruthy();
    expect(body.insights.cards).toHaveLength(6);
    expect(body.insights.mode_payload).toHaveProperty('combined');
    expect(body.insights.mode_payload).toHaveProperty('9');
    expect(body.insights.mode_payload).toHaveProperty('18');
    expect(body.insights.projection_by_mode).toHaveProperty('combined');
    expect(body.insights.projection_by_mode).toHaveProperty('9');
    expect(body.insights.projection_by_mode).toHaveProperty('18');
    expect(body.insights.projection.projectedScoreIn10).not.toBeNull();
  });

  it('resets variantOffset to 0 when auto generation sees a changed data hash', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
    });
    mockedPrisma.overallInsight.findUnique.mockResolvedValue({
      userId: BigInt(1),
      modelUsed: 'overall-deterministic-v1',
      insights: { cards: Array.from({ length: 6 }, () => ''), tier_context: { isPremium: true } },
      dataHash: 'outdated-hash',
      variantOffset: 9,
      generatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    await generateAndStoreOverallInsights(BigInt(1), false);

    expect(mockedPrisma.overallInsight.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockedPrisma.overallInsight.upsert.mock.calls[0][0];
    expect(upsertArgs.update.variantOffset).toBe(0);
  });

  it('increments variantOffset on manual regenerate', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
    });
    mockedPrisma.overallInsight.findUnique.mockResolvedValue({
      userId: BigInt(1),
      modelUsed: 'overall-deterministic-v1',
      insights: { cards: Array.from({ length: 6 }, () => ''), tier_context: { isPremium: true } },
      dataHash: 'some-hash',
      variantOffset: 4,
      generatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    await generateAndStoreOverallInsights(BigInt(1), true);

    expect(mockedPrisma.overallInsight.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockedPrisma.overallInsight.upsert.mock.calls[0][0];
    expect(upsertArgs.update.variantOffset).toBe(5);
  });
});


