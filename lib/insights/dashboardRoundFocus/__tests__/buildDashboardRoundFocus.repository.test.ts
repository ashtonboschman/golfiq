import { prisma } from '@/lib/db';
import { isPremiumUser } from '@/lib/subscription';
import { computeCurrentRoundIdentityHash } from '@/lib/insights/roundIdentity/currentIdentityHash';
import { ROUND_IDENTITY_V1_VERSION } from '@/lib/insights/roundIdentity/types';
import {
  buildDashboardRoundFocus,
  parseDashboardFocusHoleCount,
} from '../buildDashboardRoundFocus';

jest.mock('@/lib/db', () => ({
  prisma: {
    round: { findMany: jest.fn() },
    roundInsight: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/subscription', () => ({ isPremiumUser: jest.fn() }));

jest.mock('@/lib/insights/roundIdentity/currentIdentityHash', () => ({
  computeCurrentRoundIdentityHash: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  round: { findMany: jest.Mock };
  roundInsight: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
};
const mockedIsPremiumUser = isPremiumUser as jest.Mock;
const mockedComputeHash = computeCurrentRoundIdentityHash as jest.Mock;

function makeDbRound(id: number, holesPlayed: unknown = 18) {
  return {
    id: BigInt(id),
    date: new Date(Date.UTC(2026, 5, id, 12)),
    createdAt: new Date(Date.UTC(2026, 5, id, 13)),
    holesPlayed,
    roundContext: 'real',
    girHit: 8,
    roundStrokesGained: {
      sgOffTee: 0.2,
      sgApproach: id >= 16 ? -0.6 : -0.2,
      sgShortGame: 0.2,
      sgPutting: 0.2,
      sgResidual: 0,
      partialAnalysis: false,
    },
  };
}

describe('buildDashboardRoundFocus default repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.round.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeDbRound(20 - index)),
    );
    mockedPrisma.roundInsight.findUnique.mockResolvedValue({
      insights: {
        raw_payload: {
          round_identity_v1: {
            version: ROUND_IDENTITY_V1_VERSION,
            inputHash: 'matching-hash',
            primaryKey: 'approach_leak',
            title: 'Approach Leak',
            summary: 'Approach shaped the round.',
            shapedBy: [],
            nextRoundFocus: 'Legacy value',
            modifiers: [],
            evidenceLevel: 'aggregate_stats',
            confidence: 'strong',
            sampleContext: 'established',
            tone: 'fix',
            overallTone: 'warning',
            entryMode: 'post_round',
            statCompletenessScore: 90,
          },
        },
      },
    });
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
    });
    mockedComputeHash.mockResolvedValue('matching-hash');
    mockedIsPremiumUser.mockReturnValue(true);
  });

  it('loads a viewer-neutral 20-round envelope and accepts only a matching current hash', async () => {
    const now = new Date('2026-07-01T12:00:00.000Z');
    const result = await buildDashboardRoundFocus({
      dashboardOwnerId: BigInt(1),
      viewerId: BigInt(1),
      mode: '18',
      roundContext: 'real',
      now,
    });

    expect(mockedPrisma.round.findMany).toHaveBeenCalledWith({
      where: {
        userId: BigInt(1),
        roundContext: 'real',
        date: { lte: now },
        holesPlayed: 18,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: expect.any(Object),
    });
    expect(mockedComputeHash).toHaveBeenCalledWith(BigInt(20), BigInt(1));
    expect(result.internal.latestRoundFocus).toMatchObject({
      kind: 'available',
      sourceRoundId: '20',
    });
    expect(result.dto).toMatchObject({
      tier: 'premium',
      source: 'trend',
      selectedCategory: 'approach',
    });
  });

  it.each([
    [9, 9],
    [18, 18],
    [10, null],
    [17, null],
    [0, null],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
    ['18', null],
  ])('parses persisted hole count %p as %p', (value, expected) => {
    expect(parseDashboardFocusHoleCount(value)).toBe(expected);
  });

  it.each([10, 17, 0, null, undefined, Number.NaN, '18'])(
    'marks malformed persisted hole count %p for envelope exclusion',
    async (holesPlayed) => {
      mockedPrisma.round.findMany.mockResolvedValue([
        { ...makeDbRound(20), holesPlayed },
        ...Array.from({ length: 19 }, (_, index) => makeDbRound(19 - index)),
      ]);

      const result = await buildDashboardRoundFocus({
        dashboardOwnerId: BigInt(1),
        viewerId: BigInt(1),
        mode: 'combined',
        roundContext: 'real',
        now: new Date('2026-07-01T12:00:00.000Z'),
      });

      expect(result.internal.envelope.excludedCounts.malformed).toBe(1);
      expect(result.internal.envelope.recentRoundIds).toEqual(['19', '18', '17', '16', '15']);
      expect(result.internal.envelope.recentRounds.every((round) => round.holes === 18)).toBe(true);
    },
  );

  it('preserves valid nine-hole candidates for one combined-mode normalization pass', async () => {
    mockedPrisma.round.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeDbRound(20 - index, index === 0 ? 9 : 18)),
    );

    const result = await buildDashboardRoundFocus({
      dashboardOwnerId: BigInt(1),
      viewerId: BigInt(1),
      mode: 'combined',
      roundContext: 'real',
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    expect(result.internal.envelope.recentRounds[0].holes).toBe(9);
    expect(result.internal.trend).toMatchObject({
      kind: 'component',
      category: 'approach',
      recentAverage: -0.72,
    });
  });
});
