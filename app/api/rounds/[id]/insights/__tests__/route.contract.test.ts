import { GET, generateInsights } from '@/app/api/rounds/[id]/insights/route';
import { prisma } from '@/lib/db';
import { runMeasuredSgSelection } from '@/lib/insights/postRound/sgSelection';
import { getServerSession } from 'next-auth';

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
const mockedGetServerSession = getServerSession as jest.Mock;

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
    mockedGetServerSession.mockResolvedValue({ user: { id: '1' } });

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
      roundHoles: [],
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

  it('adds premium directional M2 qualifier only when this-round skew is clearly supported', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.createdAt === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (args?.orderBy?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 74,
      firHit: 7,
      girHit: 8,
      putts: 32,
      penalties: 1,
      teeSegment: 'full',
      roundHoles: [
        { firDirection: null, girDirection: 'miss_right' },
        { firDirection: null, girDirection: 'miss_right' },
        { firDirection: null, girDirection: 'miss_right' },
        { firDirection: null, girDirection: 'miss_right' },
        { firDirection: null, girDirection: 'miss_right' },
        { firDirection: null, girDirection: 'miss_short' },
      ],
      tee: makeTee(),
    });
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.1 },
        { name: 'putting', label: 'Putting', value: -0.4 },
        { name: 'penalties', label: 'Penalties', value: -0.1 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.1 },
      opportunityIsWeak: true,
      componentCount: 4,
      residualDominant: false,
      weakSeparation: false,
    });

    const premium = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );
    const free = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(premium.messages[1]).toMatch(/Recorded GIR misses clustered right this round/i);
    expect(premium.messages[1].toLowerCase()).not.toMatch(/swing|clubface|path|mechanic|slice/);
    expect(free.messages[1]).not.toMatch(/Recorded GIR misses clustered right this round/i);
  });

  it('suppresses directional qualifier when sample is tiny or mixed', async () => {
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
      roundHoles: [
        { firDirection: 'miss_left', girDirection: null },
        { firDirection: 'miss_right', girDirection: null },
        { firDirection: 'miss_left', girDirection: null },
        { firDirection: 'miss_right', girDirection: null },
      ],
      tee: makeTee(),
    });
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -1.2 },
        { name: 'approach', label: 'Approach', value: -0.6 },
        { name: 'putting', label: 'Putting', value: -0.3 },
      ],
      best: { name: 'putting', label: 'Putting', value: -0.3 },
      opportunity: { name: 'off_tee', label: 'Off The Tee', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 3,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages[1]).not.toMatch(/Recorded FIR misses|Recorded GIR misses/i);
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

  it('uses logged order (createdAt) so backdated rounds do not re-enter onboarding', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-01-01T12:00:00.000Z'),
      score: 74,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: makeTee(),
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.createdAt === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-30T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-10T12:00:00.000Z') },
        ];
      }

      if (args?.orderBy?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }

      return [];
    });

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

    await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );

    const savedInsights = mockedPrisma.roundInsight.upsert.mock.calls[0][0].create.insights;
    expect(savedInsights.messages).toHaveLength(3);
    expect(['LOW', 'MED', 'HIGH']).toContain(savedInsights.confidence);
    expect(savedInsights.raw_payload?.onboarding?.active).toBe(false);
    expect(savedInsights.message_outcomes[0]).not.toMatch(/^OB-/);
  });

  it('scopes real-round context queries to real rounds only', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 74,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      roundContext: 'real',
      teeSegment: 'full',
      tee: makeTee(),
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);

    await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: BigInt(1),
          roundContext: 'real',
        }),
      }),
    );
    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: BigInt(1),
          roundContext: 'real',
        }),
      }),
    );
  });

  it('scopes simulator-round context queries to simulator rounds', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 74,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      roundContext: 'simulator',
      teeSegment: 'full',
      tee: makeTee(),
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);

    await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: BigInt(1),
          roundContext: 'simulator',
        }),
      }),
    );
    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: BigInt(1),
          roundContext: 'simulator',
        }),
      }),
    );
  });

  it('returns generic errors for unexpected GET failures', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedPrisma.user.findUnique.mockRejectedValueOnce(new Error('sensitive backend failure'));

    const request = new Request('http://localhost/api/rounds/40/insights');
    const response = await GET(request as any, { params: Promise.resolve({ id: '40' }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe('Error fetching insights');
    expect(body.message).not.toContain('sensitive');
    consoleErrorSpy.mockRestore();
  });

  it('free users do not receive SG numeric precision or residual suffix in insight cards', async () => {
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.3 },
        { name: 'putting', label: 'Putting', value: -0.9 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.3 },
      opportunityIsWeak: true,
      componentCount: 3,
      residualDominant: true,
      weakSeparation: false,
    });

    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -1.8,
      sgOffTee: -0.2,
      sgApproach: -1.3,
      sgPutting: -0.9,
      sgPenalties: null,
      sgResidual: 2.0,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages).toHaveLength(3);
    expect(insights.messages[1]).not.toMatch(/\b\d+(\.\d)? strokes\b/i);
    expect(insights.messages[1]).not.toMatch(/strokes gained/i);
    expect(insights.messages[1]).not.toMatch(/\+\d+(\.\d)? strokes/i);
    expect(insights.messages[1]).not.toMatch(/-\d+(\.\d)? strokes/i);
    expect(insights.messages[1].toLowerCase()).not.toContain('tracked stats');
    expect(insights.messages[1].toLowerCase()).not.toContain('untracked parts');
    expect(insights.messages[1].toLowerCase()).not.toContain('not fully tracked');
    expect(insights.messages.join(' ').toLowerCase()).not.toContain('residual');
  });

  it('premium users include residual suffix only when residual is dominant', async () => {
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.3 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.3 },
      opportunityIsWeak: true,
      componentCount: 2,
      residualDominant: true,
      weakSeparation: false,
    });

    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -1.4,
      sgOffTee: -0.2,
      sgApproach: -1.3,
      sgPutting: null,
      sgPenalties: null,
      sgResidual: 2.0,
    });

    const dominant = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(dominant.messages[1].toLowerCase()).toMatch(
      /short game and getting up and down|not shown in these stats|other parts of your game not shown in these stats/,
    );
    expect(dominant.messages.join(' ').toLowerCase()).not.toContain('residual');

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.3 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.3 },
      opportunityIsWeak: true,
      componentCount: 2,
      residualDominant: false,
      weakSeparation: false,
    });

    const nonDominant = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(nonDominant.messages[1].toLowerCase()).not.toContain('tracked stats');
    expect(nonDominant.messages[0].toLowerCase()).not.toContain('tracked stats');
    expect(nonDominant.messages[2].toLowerCase()).not.toContain('tracked stats');
    expect(nonDominant.messages.join(' ').toLowerCase()).not.toContain('residual');
  });

  it('premium residual suffix requires dominant residual above magnitude threshold', async () => {
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.3 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.3 },
      opportunityIsWeak: true,
      componentCount: 2,
      residualDominant: true,
      weakSeparation: false,
    });

    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -1.4,
      sgOffTee: -0.2,
      sgApproach: -1.3,
      sgPutting: null,
      sgPenalties: null,
      sgResidual: 1.9,
    });

    const belowThreshold = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(belowThreshold.messages.join(' ').toLowerCase()).not.toMatch(
      /short game and getting up and down|not shown in these stats|other parts of your game not shown in these stats/,
    );
  });

  it('round 1 is LOW confidence and keeps M1/M2 broad even with measured SG components', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(40), score: 74, date: new Date('2026-02-03T12:00:00.000Z'), createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.3 },
        { name: 'putting', label: 'Putting', value: -0.7 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.3 },
      opportunityIsWeak: true,
      componentCount: 3,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.confidence).toBe('LOW');
    expect(insights.messages[0]).toMatch(/^You shot /);
    expect(insights.messages[0]).not.toMatch(/Off The Tee|Approach|Putting|Penalties/);
    expect(insights.messages[1].toLowerCase()).not.toContain('main source');
    expect(insights.messages[1].toLowerCase()).not.toContain('biggest source');
    expect(insights.messages[1].toLowerCase()).not.toContain('cost the most');
    expect(insights.messages[1].toLowerCase()).not.toContain('accounted for the most');
    expect(insights.messages[1].toLowerCase()).not.toContain('strokes gained');
    expect(insights.messages[1]).not.toMatch(/\b\d+(\.\d)? strokes\b/i);
  });

  it('MED vs HIGH confidence differ in M2 decisiveness at the API boundary', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.createdAt === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (args?.orderBy?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    mockedRunMeasuredSgSelection.mockReset();
    mockedRunMeasuredSgSelection.mockReturnValueOnce({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.2 },
        { name: 'putting', label: 'Putting', value: -0.6 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 3,
      residualDominant: false,
      weakSeparation: false,
    });
    const high = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    mockedRunMeasuredSgSelection.mockReturnValueOnce({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.2 },
        { name: 'putting', label: 'Putting', value: -0.6 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 3,
      residualDominant: false,
      weakSeparation: true,
    });
    const med = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(high.confidence).toBe('HIGH');
    expect(med.confidence).toBe('MED');
    expect(high.message_outcomes[1]).toBe('M2-D');
    expect(med.message_outcomes[1]).toBe('M2-D');
    expect(high.messages[1].toLowerCase()).not.toMatch(/likely|looked like/);
    expect(med.messages[1].toLowerCase()).toMatch(/likely|looked like/);
  });

  it('residual-dominant ambiguous rounds acknowledge uncertainty in premium M2 copy', async () => {
    mockedRunMeasuredSgSelection.mockReset();
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -0.6 },
        { name: 'putting', label: 'Putting', value: -0.4 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -0.6 },
      opportunityIsWeak: true,
      componentCount: 3,
      residualDominant: true,
      weakSeparation: true,
    });
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -1.2,
      sgOffTee: -0.2,
      sgApproach: -0.6,
      sgPutting: -0.4,
      sgPenalties: null,
      sgResidual: 2.0,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.confidence).toBe('MED');
    expect(insights.message_outcomes[1]).toBe('M2-D');
    expect(insights.messages[1].toLowerCase()).toContain('not shown in these stats');
    expect(insights.messages[1].toLowerCase()).toMatch(/likely|looked like/);
    expect(insights.messages[1].toLowerCase()).not.toContain('main source of lost strokes');
  });

  it('round 1 score-only premium M1 includes setup phrase when no history exists', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 46,
      firHit: null,
      girHit: null,
      putts: null,
      penalties: null,
      teeSegment: 'front9',
      tee: makeTee(),
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(40), score: 46, date: new Date('2026-02-03T12:00:00.000Z'), createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [],
      best: null,
      opportunity: null,
      opportunityIsWeak: false,
      componentCount: 0,
      residualDominant: false,
      weakSeparation: false,
    });
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue(null);

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages[0]).toContain('You shot 46');
    expect(insights.messages[0]).toMatch(
      /A solid starting point to build from\.|A good usual level to build from\.|This gives you a starting point for future rounds\./,
    );
    expect(insights.message_levels[0]).toBe('success');
  });

  it('round 1 score-only free M1 keeps setup phrase (not first sentence only)', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 46,
      firHit: null,
      girHit: null,
      putts: null,
      penalties: null,
      teeSegment: 'front9',
      tee: makeTee(),
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(40), score: 46, date: new Date('2026-02-03T12:00:00.000Z'), createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [],
      best: null,
      opportunity: null,
      opportunityIsWeak: false,
      componentCount: 0,
      residualDominant: false,
      weakSeparation: false,
    });
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue(null);

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages[0]).toContain('You shot 46');
    expect(insights.messages[0]).toMatch(
      /A solid starting point to build from\.|A good usual level to build from\.|This gives you a starting point for future rounds\./,
    );
    expect(insights.messages[0]).not.toBe('You shot 46 (+10).');
    expect(insights.message_levels[0]).toBe('success');
  });

  it('M1 worse-than-baseline is warning (regression: 89 vs recent average 80.8)', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 89,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: { ...makeTee(), parTotal: 70 },
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 89, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 80.6, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 81.0, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.2 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 2,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages[0]).toContain('above your recent average');
    expect(insights.message_levels[0]).toBe('warning');
  });

  it('M1 better-than-baseline is great', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 79,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: { ...makeTee(), parTotal: 70 },
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 79, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 82.0, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 81.6, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.2 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 2,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages[0]).toContain('better than your recent average');
    expect(insights.message_levels[0]).toBe('great');
  });

  it('M1 near-baseline is success', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 81,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: { ...makeTee(), parTotal: 70 },
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 81, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 81.1, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 80.9, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
        { name: 'approach', label: 'Approach', value: -1.2 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      opportunity: { name: 'approach', label: 'Approach', value: -1.2 },
      opportunityIsWeak: true,
      componentCount: 2,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true, showStrokesGained: true },
      { forceRegenerate: true, bumpVariant: false },
    );

    expect(insights.messages[0]).toContain('matches your recent average');
    expect(insights.message_levels[0]).toBe('success');
  });

  it('M2 outcome levels map to semantic levels (C=info, D=warning, E=success)', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.createdAt === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (args?.orderBy?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    const cases = [
      {
        name: 'M2-C',
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: -0.1 },
            { name: 'approach', label: 'Approach', value: 0.0 },
          ],
          best: { name: 'approach', label: 'Approach', value: 0.0 },
          opportunity: { name: 'off_tee', label: 'Off The Tee', value: -0.1 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
        level: 'info',
      },
      {
        name: 'M2-D',
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
            { name: 'approach', label: 'Approach', value: -1.1 },
          ],
          best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
          opportunity: { name: 'approach', label: 'Approach', value: -1.1 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
        level: 'warning',
      },
      {
        name: 'M2-E',
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: 0.9 },
            { name: 'approach', label: 'Approach', value: 0.4 },
          ],
          best: { name: 'off_tee', label: 'Off The Tee', value: 0.9 },
          opportunity: { name: 'approach', label: 'Approach', value: 0.4 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
        level: 'success',
      },
    ] as const;

    for (const testCase of cases) {
      mockedRunMeasuredSgSelection.mockReturnValue(testCase.selection);

      const insights = await generateInsights(
        BigInt(40),
        BigInt(1),
        { isPremium: true, showStrokesGained: true },
        { forceRegenerate: true, bumpVariant: false },
      );

      expect(insights.message_outcomes[1]).toBe(testCase.name);
      expect(insights.message_levels[1]).toBe(testCase.level);
    }
  });

  it('free rewritten M2 level matches the final displayed free text', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.createdAt === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (args?.orderBy?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    const cases = [
      {
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
            { name: 'approach', label: 'Approach', value: -1.1 },
          ],
          best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
          opportunity: { name: 'approach', label: 'Approach', value: -1.1 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
        expectedText: 'Approach was the biggest source of lost strokes.',
        expectedLevel: 'warning',
      },
      {
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: 0.9 },
            { name: 'approach', label: 'Approach', value: 0.4 },
          ],
          best: { name: 'off_tee', label: 'Off The Tee', value: 0.9 },
          opportunity: { name: 'approach', label: 'Approach', value: 0.4 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
        expectedText: 'Approach was the strongest part of the round.',
        expectedLevel: 'success',
      },
      {
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: -0.1 },
            { name: 'approach', label: 'Approach', value: 0.0 },
          ],
          best: { name: 'approach', label: 'Approach', value: 0.0 },
          opportunity: { name: 'off_tee', label: 'Off The Tee', value: -0.1 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
        expectedText: "Off The Tee didn't make much difference to your score.",
        expectedLevel: 'info',
      },
    ] as const;

    for (const testCase of cases) {
      mockedRunMeasuredSgSelection.mockReturnValue(testCase.selection);

      const insights = await generateInsights(
        BigInt(40),
        BigInt(1),
        { isPremium: false, showStrokesGained: true },
        { forceRegenerate: true, bumpVariant: false },
      );

      expect(insights.messages[1]).toBe(testCase.expectedText);
      expect(insights.message_levels[1]).toBe(testCase.expectedLevel);
    }
  });

  it('M3 remains info-level across outcomes', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.createdAt === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (args?.orderBy?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    const cases = [
      {
        selection: {
          components: [
            { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
            { name: 'approach', label: 'Approach', value: -1.1 },
          ],
          best: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
          opportunity: { name: 'approach', label: 'Approach', value: -1.1 },
          opportunityIsWeak: true,
          componentCount: 2,
          residualDominant: false,
          weakSeparation: false,
        },
      },
      {
        selection: {
          components: [],
          best: null,
          opportunity: null,
          opportunityIsWeak: false,
          componentCount: 0,
          residualDominant: false,
          weakSeparation: false,
        },
      },
    ] as const;

    for (const testCase of cases) {
      mockedRunMeasuredSgSelection.mockReturnValue(testCase.selection);
      const insights = await generateInsights(
        BigInt(40),
        BigInt(1),
        { isPremium: true, showStrokesGained: true },
        { forceRegenerate: true, bumpVariant: false },
      );
      expect(insights.messages[2].startsWith('Next round:')).toBe(true);
      expect(insights.message_levels[2]).toBe('info');
    }
  });
});
