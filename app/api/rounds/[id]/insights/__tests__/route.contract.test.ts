import { generateInsights } from '@/app/api/rounds/[id]/insights/route';
import { prisma } from '@/lib/db';
import { runMeasuredSgSelection } from '@/lib/insights/postRound/sgSelection';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/auth-config', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    roundInsight: { findUnique: jest.fn(), upsert: jest.fn() },
    round: { findUnique: jest.fn(), findMany: jest.fn() },
    roundStrokesGained: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/insights/postRound/sgSelection', () => {
  const actual = jest.requireActual('@/lib/insights/postRound/sgSelection');
  return {
    ...actual,
    runMeasuredSgSelection: jest.fn(),
  };
});

type MockPrisma = {
  roundInsight: { findUnique: jest.Mock; upsert: jest.Mock };
  round: { findUnique: jest.Mock; findMany: jest.Mock };
  roundStrokesGained: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
};

const mockedPrisma = prisma as unknown as MockPrisma;
const mockedRunMeasuredSgSelection = runMeasuredSgSelection as jest.Mock;

function makeTee() {
  return {
    numberOfHoles: 18,
    courseRating: 71.2,
    slopeRating: 127,
    bogeyRating: 94.0,
    parTotal: 72,
    nonPar3Holes: 14,
    frontCourseRating: 35.6,
    frontSlopeRating: 63,
    frontBogeyRating: 47.0,
    backCourseRating: 35.6,
    backSlopeRating: 64,
    backBogeyRating: 47.0,
    holes: Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: index % 3 === 0 ? 3 : 4,
    })),
  };
}

describe('/api/rounds/[id]/insights route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedPrisma.roundInsight.findUnique.mockResolvedValue(null);
    mockedPrisma.roundInsight.upsert.mockImplementation(async (args: any) => ({
      insights: args.create?.insights ?? args.update?.insights,
    }));

    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 74,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: makeTee(),
    });

    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 78, date: new Date('2026-01-01T12:00:00.000Z'), createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 77, date: new Date('2026-01-10T12:00:00.000Z'), createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 76, date: new Date('2026-01-20T12:00:00.000Z'), createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 74, date: new Date('2026-02-03T12:00:00.000Z'), createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);

    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -0.4,
      sgOffTee: -0.2,
      sgApproach: -0.8,
      sgPutting: -1.2,
      sgPenalties: -0.1,
      sgResidual: 1.9,
    });
  });

  it('keeps area-specific next-round focus when weak separation exists but a strong leak is present', async () => {
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -0.8 },
        { name: 'putting', label: 'Putting', value: -1.2 },
        { name: 'penalties', label: 'Penalties', value: -0.1 },
      ],
      best: { name: 'penalties', label: 'Penalties', value: -0.1 },
      opportunity: { name: 'putting', label: 'Putting', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 4,
      residualDominant: false,
      weakSeparation: true,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.message_outcomes[2]).toBe('M3-C');
    expect(insights.messages[2].startsWith('Next round:')).toBe(true);
  });
});
