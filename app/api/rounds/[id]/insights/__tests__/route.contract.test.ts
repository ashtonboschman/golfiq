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
    jest.resetAllMocks();
    mockedGetServerSession.mockResolvedValue({ user: { id: '1' } });

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [],
      best: null,
      opportunity: null,
      opportunityIsWeak: false,
      componentCount: 0,
      residualDominant: false,
      weakSeparation: false,
    });

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

    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, date: new Date('2026-01-01T12:00:00.000Z'), createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, date: new Date('2026-01-10T12:00:00.000Z'), createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, date: new Date('2026-01-20T12:00:00.000Z'), createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, date: new Date('2026-02-03T12:00:00.000Z'), createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

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
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
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
      holeByHole: true,
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
      { isPremium: true },
      { forceRegenerate: true },
    );
    const storedInsights = mockedPrisma.roundInsight.upsert.mock.calls[0][0].create.insights;
    mockedPrisma.roundInsight.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      userId: BigInt(1),
      insights: storedInsights,
    });

    const free = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false },
    );
    const premiumAfterFreeView = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
    );

    expect(premium.messages[1]).toMatch(/This round's GIR misses were mostly right/i);
    expect(premium.messages[1]).toMatch(/\(5\/6\)/);
    expect(premium.messages[1].toLowerCase()).not.toMatch(/swing|clubface|path|mechanic|slice/);
    expect(free.messages[1]).not.toMatch(/This round's GIR misses were mostly right/i);
    expect(premiumAfterFreeView.messages[1]).toMatch(/This round's GIR misses were mostly right \(5\/6\)/i);
    expect(storedInsights.messages[1]).not.toMatch(/This round's GIR misses/i);
    expect(storedInsights.raw_payload.round_identity_v1.displayEvidence.directional).toEqual(
      expect.objectContaining({
        area: 'gir',
        dominantDirection: 'right',
        count: 5,
        totalDirectionalMisses: 6,
      }),
    );
  });

  it('regenerates when stored round_identity_v1 hash is stale', async () => {
    mockedPrisma.roundInsight.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      userId: BigInt(1),
      insights: {
        messages: ['old 1', 'old 2', 'old 3'],
        raw_payload: {
          round_identity_v1: {
            version: 'round_identity_v1.0.0',
            inputHash: 'stale_hash',
          },
        },
      },
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
    );

    expect(mockedPrisma.roundInsight.upsert).toHaveBeenCalled();
    expect(insights.round_identity_v1.inputHash).not.toBe('stale_hash');
  });

  it('does not use HBH evidence when holeByHole is false, even if round holes exist', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 84,
      firHit: 7,
      girHit: 7,
      putts: 34,
      penalties: 1,
      holeByHole: false,
      teeSegment: 'full',
      roundHoles: Array.from({ length: 18 }, (_, index) => ({
        pass: 1,
        score: 5,
        firHit: 0,
        girHit: 0,
        putts: 2,
        penalties: 0,
        chips: 1,
        greensideBunkerShots: 0,
        firDirection: null,
        girDirection: null,
        hole: { holeNumber: index + 1, par: 4 },
      })),
      tee: makeTee(),
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.round_identity_v1.entryMode).toBe('post_round');
    expect(insights.round_identity_v1.evidenceLevel).not.toBe('hole_by_hole');
  });

  it('reconstructs live-round sequence from the recorded starting hole', async () => {
    const tee = makeTee();
    const roundHoles = tee.holes.map((hole) => ({
      pass: 1,
      score: hole.par + (hole.holeNumber === 18 ? 2 : 0),
      firHit: 1,
      girHit: 1,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
      hole,
    }));

    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: roundHoles.reduce((sum, hole) => sum + hole.score, 0),
      firHit: 14,
      girHit: 17,
      putts: 36,
      penalties: 0,
      holeByHole: true,
      teeSegment: 'full',
      finalizedLiveRoundSession: { startHoleNumber: 7 },
      roundHoles,
      tee,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.round_identity_v1.evidenceLevel).toBe('hole_by_hole');
    expect(insights.round_identity_v1.modifiers).toContain('bounce_back');
  });

  it('passes short-game opportunity guard inputs into measured SG selection', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 40,
      firHit: 4,
      girHit: 8, // 1 missed green in a 9-hole front segment
      putts: 16,
      penalties: 0,
      teeSegment: 'front9',
      roundHoles: [],
      tee: makeTee(),
    });
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -0.6,
      sgOffTee: -0.1,
      sgApproach: -0.2,
      sgShortGame: -0.9,
      sgPutting: -0.2,
      sgPenalties: 0,
      sgResidual: -0.2,
    });
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.1 },
        { name: 'approach', label: 'Approach', value: -0.2 },
        { name: 'putting', label: 'Putting', value: -0.2 },
      ],
      best: { name: 'off_tee', label: 'Off The Tee', value: -0.1 },
      opportunity: { name: 'approach', label: 'Approach', value: -0.2 },
      opportunityIsWeak: false,
      componentCount: 3,
      residualDominant: false,
      weakSeparation: true,
    });

    await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(mockedRunMeasuredSgSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        shortGame: -0.9,
        shortGameOpportunities: 1,
        minShortGameOpportunities: 2,
      }),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it('uses broad all-positive M2 framing when short-game SG is excluded by low opportunities', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 95, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 94, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 92, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 82, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [
          { id: BigInt(39), score: 93, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 94, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(37), score: 92, date: new Date('2026-01-25T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(36), score: 93, date: new Date('2026-01-22T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(35), score: 94, date: new Date('2026-01-18T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 82,
      firHit: 9,
      girHit: 15,
      putts: 34,
      penalties: 0,
      teeSegment: 'full',
      chips: 4,
      greensideBunkerShots: 1,
      shortGameShots: 5,
      roundHoles: [],
      tee: {
        ...makeTee(),
        parTotal: 70,
        nonPar3Holes: 12,
        courseRating: 67.3,
        slopeRating: 112,
      },
    });
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: 9.6,
      sgOffTee: 1.0,
      sgApproach: 4.8,
      sgShortGame: -0.8,
      sgPutting: 3.1,
      sgPenalties: 2.9,
      sgResidual: -1.4,
    });
    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: 1.0 },
        { name: 'approach', label: 'Approach', value: 4.8 },
        { name: 'putting', label: 'Putting', value: 3.1 },
        { name: 'penalties', label: 'Penalties', value: 2.9 },
      ],
      best: { name: 'approach', label: 'Approach', value: 4.8 },
      opportunity: { name: 'off_tee', label: 'Off The Tee', value: 1.0 },
      opportunityIsWeak: false,
      componentCount: 4,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.messages).toHaveLength(3);
    expect(insights.messages[0]).toMatch(/You shot 82 \(\+12\)/);
    expect(insights.messages[0]).toMatch(/Approach/);
    expect(insights.messages[0]).toMatch(/4\.8 strokes/);

    expect(insights.message_outcomes[1]).toBe('M2-E');
    expect(insights.messages[1]).toMatch(
      /Several areas contributed positively|No measured area clearly held the round back|The round stayed steady because no major measured area added much pressure|Multiple areas helped the score/,
    );
    expect(insights.messages[1]).not.toMatch(/Off The Tee likely helped|Off Tee likely helped|Off The Tee/i);
    expect(insights.message_outcomes[2]).toBe('M3-E');
    expect(insights.messages[2]).toMatch(
      /Keep choosing targets that leave a playable next shot|Let the safest miss guide decisions when risk appears|Keep favoring the side that keeps recovery manageable|Build decisions around avoiding the miss that escalates the hole/,
    );
    expect(insights.messages[2]).not.toMatch(/Off the tee|tee strategy|tee targets/i);

    if (
      insights.raw_payload?.sg &&
      Object.prototype.hasOwnProperty.call(insights.raw_payload.sg, 'short_game')
    ) {
      expect(insights.raw_payload.sg.short_game).toBe(-0.8);
    }
    expect(mockedRunMeasuredSgSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        shortGame: -0.8,
        shortGameOpportunities: 3,
        minShortGameOpportunities: 4,
      }),
      expect.any(Number),
      expect.any(Object),
    );
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.message_outcomes[2]).toBe('M3-C');
    expect(insights.messages[2].startsWith('Next round:')).toBe(true);
  });

  it('uses historical played date-time order and excludes future rounds from baseline scope', async () => {
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
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, date: new Date('2025-12-20T12:00:00.000Z') },
          { id: BigInt(20), score: 77, date: new Date('2025-12-28T12:00:00.000Z') },
          { id: BigInt(30), score: 76, date: new Date('2025-12-31T12:00:00.000Z') },
          { id: BigInt(40), score: 74, date: new Date('2026-01-01T12:00:00.000Z') },
        ];
      }

      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
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
      { isPremium: false },
      { forceRegenerate: true },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { date: { lt: new Date('2026-01-01T12:00:00.000Z') } },
            { id: BigInt(40) },
          ],
        }),
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: BigInt(40) },
          date: { lt: new Date('2026-01-01T12:00:00.000Z') },
        }),
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: false },
      { forceRegenerate: true },
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
    expect(insights.round_identity_v1).toBeNull();
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
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(dominant.messages[1].toLowerCase()).toMatch(
      /part of the round slipped away through overlapping mistakes across multiple areas|a few scoring leaks came from in-between situations across the round|several costly holes came from situations that crossed multiple parts of the game|some strokes slipped away through connected mistakes rather than one clear area|a few scoring boosts came from in-between situations across the round|several positive swings came from connected moments across multiple parts of the game|part of the scoring came from situations that overlapped rather than one clear area|some gains came from holes where multiple parts of the game worked together/,
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
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

  it('LOW-confidence grounded M2 uses penalty-pressure copy for extreme penalty/off-tee rounds even when GIR is low', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 95,
      firHit: 2,
      girHit: 5,
      putts: 35,
      penalties: 5,
      teeSegment: 'full',
      roundHoles: [],
      tee: { ...makeTee(), nonPar3Holes: 12, parTotal: 70 },
    });

    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(40), score: 95, date: new Date('2026-02-03T12:00:00.000Z'), createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([]);

    mockedRunMeasuredSgSelection.mockReturnValue({
      components: [
        { name: 'off_tee', label: 'Off The Tee', value: -1.9 },
        { name: 'approach', label: 'Approach', value: -1.4 },
        { name: 'putting', label: 'Putting', value: -0.5 },
        { name: 'penalties', label: 'Penalties', value: -3.1 },
      ],
      best: { name: 'putting', label: 'Putting', value: -0.5 },
      opportunity: { name: 'penalties', label: 'Penalties', value: -3.1 },
      opportunityIsWeak: true,
      componentCount: 4,
      residualDominant: false,
      weakSeparation: false,
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.confidence).toBe('LOW');
    expect(insights.message_outcomes[1]).toBe('M2-A');
    expect(insights.messages[1]).toMatch(
      /Penalty trouble created the biggest scoring pressure in this round|Penalty strokes made too many holes harder to contain|Trouble off the tee made too many holes harder from the start|Penalty trouble made too many holes harder to manage/,
    );
    expect(insights.messages[1]).not.toContain('Missing that many greens usually puts pressure');
  });

  it('keeps legacy M2 decisiveness while projecting canonical confidence consistently across tiers', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    mockedRunMeasuredSgSelection.mockReset();
    const decisiveSelection = {
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
    };
    mockedRunMeasuredSgSelection.mockReturnValue(decisiveSelection);
    const high = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );
    const freeHigh = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(high.round_identity_v1.confidence).toBe('moderate');
    expect(high.confidence).toBe('MED');
    expect(freeHigh.confidence).toBe('MED');
    expect(med.confidence).toBe('MED');
    expect(high.message_outcomes[1]).toBe('M2-D');
    expect(med.message_outcomes[1]).toBe('M2-D');
    expect(high.messages[1].toLowerCase()).not.toMatch(/likely|looked like/);
    expect(med.messages[1].toLowerCase()).toMatch(/likely|looked like/);
  });

  it('residual-dominant ambiguous rounds acknowledge uncertainty in premium M2 copy', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [
          { id: BigInt(39), score: 75, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(38), score: 76, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });
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
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.round_identity_v1.sampleContext).toBe('established');
    expect(insights.round_identity_v1.evidenceLevel).toBe('aggregate_stats');
    expect(insights.round_identity_v1.statCompletenessScore).toBeGreaterThanOrEqual(45);
    expect(insights.round_identity_v1.confidence).toBe('moderate');
    expect(insights.round_identity_v1.primaryKey).toBe('no_clear_separator');
    expect(insights.confidence).toBe('MED');
    expect(insights.message_outcomes[1]).toBe('M2-D');
    expect(insights.messages[1].toLowerCase()).toMatch(
      /likely contributed about|likely mattered at|was probably part of the story|round likely included both/,
    );
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
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.messages[0]).toContain('You shot 46');
    expect(insights.messages[0]).toMatch(
      /A solid starting point to build from\.|That gives you a good recent level to build from\.|This gives you a starting point for future rounds\./,
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
      { isPremium: false },
      { forceRegenerate: true },
    );

    expect(insights.messages[0]).toContain('You shot 46');
    expect(insights.messages[0]).toMatch(
      /A solid starting point to build from\.|That gives you a good recent level to build from\.|This gives you a starting point for future rounds\./,
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
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
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(insights.messages[0]).toContain('matches your recent average');
    expect(insights.message_levels[0]).toBe('success');
  });

  it('keeps free M1 rewarding when positive total SG and recent-score context point different ways', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 82,
      firHit: 7,
      girHit: 9,
      putts: 32,
      penalties: 1,
      teeSegment: 'full',
      roundHoles: [],
      tee: makeTee(),
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 80, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 80, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 80, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 82, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 80, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 80, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: 0.5,
      sgOffTee: 0.2,
      sgApproach: 0.1,
      sgShortGame: 0.1,
      sgPutting: 0.1,
      sgPenalties: 0,
      sgResidual: 0,
      confidence: 'medium',
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false },
      { forceRegenerate: true },
    );

    expect(insights.message_levels[0]).toBe('success');
    expect(insights.messages[0]).toMatch(/overall performance finished above expectation/i);
    expect(insights.messages[0]).not.toMatch(/\+0\.5|strokes gained/i);
  });

  it('keeps free M1 cautionary when a better score still finishes below the SG benchmark', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 78,
      firHit: 7,
      girHit: 9,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      roundHoles: [],
      tee: makeTee(),
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 80, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 80, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 80, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 78, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 80, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 80, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -0.5,
      sgOffTee: -0.1,
      sgApproach: -0.2,
      sgShortGame: -0.1,
      sgPutting: -0.1,
      sgPenalties: 0,
      sgResidual: 0,
      confidence: 'medium',
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false },
      { forceRegenerate: true },
    );

    expect(insights.message_levels[0]).toBe('warning');
    expect(insights.messages[0]).toMatch(/score improved/i);
    expect(insights.messages[0]).toMatch(/overall performance still finished below expectation/i);
    expect(insights.messages[0]).not.toMatch(/-0\.5|strokes gained/i);
  });

  it('M2 outcome levels map to semantic levels (C=info, D=warning, E=success)', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
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
        { isPremium: true },
        { forceRegenerate: true },
      );

      expect(insights.message_outcomes[1]).toBe(testCase.name);
      expect(insights.message_levels[1]).toBe(testCase.level);
    }
  });

  it('keeps free M2 aligned to the canonical identity when legacy selections disagree', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
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
        expectedText: 'Putting was the main area costing you strokes.',
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
        expectedText: 'Putting was the main area costing you strokes.',
        expectedLevel: 'warning',
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
        expectedText: 'Putting was the main area costing you strokes.',
        expectedLevel: 'warning',
      },
    ] as const;

    for (const testCase of cases) {
      mockedRunMeasuredSgSelection.mockReturnValue(testCase.selection);

      const insights = await generateInsights(
        BigInt(40),
        BigInt(1),
        { isPremium: false },
        { forceRegenerate: true },
      );

      expect(insights.messages[1]).toBe(testCase.expectedText);
      expect(insights.message_levels[1]).toBe(testCase.expectedLevel);
      expect(insights.messages[2]).toMatch(
        /^Next round: (make reducing avoidable putts|keep putting as the first area|look for cleaner finishes|make finishing holes with fewer putts)/i,
      );
      expect(insights.messages[2]).not.toMatch(/first-putt|pace|start line|three-putt/i);
    }
  });

  it('keeps free no-clear-separator M2 informational and non-decisive', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 86,
      firHit: 7,
      girHit: 6,
      putts: 32,
      penalties: 1,
      teeSegment: 'full',
      roundHoles: [],
      tee: makeTee(),
    });
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue(null);

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false },
      { forceRegenerate: true },
    );

    expect(insights.messages[1]).toMatch(/No tracked area clearly separated/i);
    expect(insights.messages[1]).toMatch(/slightly lower, but not enough to define the round/i);
    expect(insights.messages[1]).not.toMatch(/clearest leak|main area costing/i);
    expect(insights.message_levels[1]).toBe('info');
  });

  it('M3 remains info-level across outcomes', async () => {
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(10), score: 78, createdAt: new Date('2026-01-01T12:00:00.000Z') },
          { id: BigInt(20), score: 77, createdAt: new Date('2026-01-10T12:00:00.000Z') },
          { id: BigInt(30), score: 76, createdAt: new Date('2026-01-20T12:00:00.000Z') },
          { id: BigInt(40), score: 74, createdAt: new Date('2026-02-03T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
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
        { isPremium: true },
        { forceRegenerate: true },
      );
      expect(insights.messages[2].startsWith('Next round:')).toBe(true);
      expect(insights.message_levels[2]).toBe('info');
    }
  });

  it('keeps an urgent canonical M3 warning for free users without exposing premium identity detail', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      date: new Date('2026-02-03T12:00:00.000Z'),
      score: 84,
      firHit: 7,
      girHit: 9,
      putts: 32,
      penalties: 3,
      teeSegment: 'full',
      roundHoles: [],
      tee: makeTee(),
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany
      .mockResolvedValueOnce([
        { id: BigInt(10), score: 82, createdAt: new Date('2026-01-01T12:00:00.000Z') },
        { id: BigInt(20), score: 82, createdAt: new Date('2026-01-10T12:00:00.000Z') },
        { id: BigInt(30), score: 82, createdAt: new Date('2026-01-20T12:00:00.000Z') },
        { id: BigInt(40), score: 84, createdAt: new Date('2026-02-03T12:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: BigInt(39), score: 82, date: new Date('2026-02-01T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        { id: BigInt(38), score: 82, date: new Date('2026-01-28T12:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
      ]);
    mockedPrisma.roundStrokesGained.findUnique.mockResolvedValue({
      roundId: BigInt(40),
      sgTotal: -2,
      sgOffTee: 0,
      sgApproach: 0,
      sgShortGame: 0,
      sgPutting: 0,
      sgPenalties: -2,
      sgResidual: 0,
      confidence: 'medium',
    });

    const insights = await generateInsights(
      BigInt(40),
      BigInt(1),
      { isPremium: false },
      { forceRegenerate: true },
    );

    expect(insights.message_levels[2]).toBe('warning');
    expect(insights.messages[2]).toMatch(/^Next round:/);
    expect(insights.round_identity_v1).toBeNull();
  });

  it('scopes same-day two rounds by strict played date-time ordering', async () => {
    const roundA = {
      id: BigInt(101),
      userId: BigInt(1),
      date: new Date('2026-06-10T08:00:00.000Z'),
      score: 44,
      firHit: 4,
      girHit: 5,
      putts: 17,
      penalties: 0,
      teeSegment: 'front9',
      tee: makeTee(),
      roundHoles: [],
    };
    const roundB = {
      ...roundA,
      id: BigInt(102),
      date: new Date('2026-06-10T14:00:00.000Z'),
      score: 41,
    };

    mockedPrisma.round.findUnique.mockResolvedValueOnce(roundB).mockResolvedValueOnce(roundA);
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      const ascOrder = Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc';
      const descOrder = Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc';
      if (ascOrder) {
        const lt = args?.where?.OR?.[0]?.date?.lt as Date | undefined;
        if (lt?.toISOString() === '2026-06-10T14:00:00.000Z') {
          return [
            { id: BigInt(101), score: 44, date: new Date('2026-06-10T08:00:00.000Z') },
            { id: BigInt(102), score: 41, date: new Date('2026-06-10T14:00:00.000Z') },
          ];
        }
        return [{ id: BigInt(101), score: 44, date: new Date('2026-06-10T08:00:00.000Z') }];
      }
      if (descOrder) {
        const lt = args?.where?.date?.lt as Date | undefined;
        if (lt?.toISOString() === '2026-06-10T14:00:00.000Z') {
          return [{ id: BigInt(101), score: 44, date: new Date('2026-06-10T08:00:00.000Z'), teeSegment: 'front9', tee: makeTee() }];
        }
        return [];
      }
      return [];
    });
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

    const laterInsights = await generateInsights(
      BigInt(102),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );
    const earlierInsights = await generateInsights(
      BigInt(101),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    const savedLaterInsights = mockedPrisma.roundInsight.upsert.mock.calls[0][0].create.insights;
    const savedEarlierInsights = mockedPrisma.roundInsight.upsert.mock.calls[1][0].create.insights;
    expect(savedLaterInsights.raw_payload?.historical?.avg_score).not.toBeNull();
    expect(savedEarlierInsights.raw_payload?.historical?.avg_score).toBeNull();
    expect(laterInsights.round_number).toBe(2);
    expect(earlierInsights.round_identity_v1.sampleContext).toBe('first_round');
  });

  it('editing earliest round excludes all later rounds from baseline and baseline delta context', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(201),
      userId: BigInt(1),
      date: new Date('2026-07-01T08:00:00.000Z'),
      score: 43,
      firHit: 5,
      girHit: 4,
      putts: 16,
      penalties: 0,
      teeSegment: 'front9',
      tee: makeTee(),
      roundHoles: [],
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [{ id: BigInt(201), score: 43, date: new Date('2026-07-01T08:00:00.000Z') }];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [];
      }
      return [];
    });
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
      BigInt(201),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    const savedInsights = mockedPrisma.roundInsight.upsert.mock.calls[0][0].create.insights;
    expect(savedInsights.raw_payload?.historical?.avg_score).toBeNull();
    expect(insights.round_identity_v1.sampleContext).toBe('first_round');
    expect(insights.round_identity_v1.primaryKey).not.toBe('breakthrough');
  });

  it('editing middle round includes prior rounds and excludes later rounds', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(302),
      userId: BigInt(1),
      date: new Date('2026-08-02T12:00:00.000Z'),
      score: 84,
      firHit: 7,
      girHit: 8,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: makeTee(),
      roundHoles: [],
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(301), score: 88, date: new Date('2026-08-01T09:00:00.000Z') },
          { id: BigInt(302), score: 84, date: new Date('2026-08-02T12:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [{ id: BigInt(301), score: 88, date: new Date('2026-08-01T09:00:00.000Z'), teeSegment: 'full', tee: makeTee() }];
      }
      return [];
    });

    const insights = await generateInsights(
      BigInt(302),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          date: { lt: new Date('2026-08-02T12:00:00.000Z') },
        }),
      }),
    );
    expect(insights.raw_payload?.historical?.avg_score).not.toBeNull();
  });

  it('editing latest round includes all earlier rounds and excludes current round by id', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(403),
      userId: BigInt(1),
      date: new Date('2026-09-03T18:00:00.000Z'),
      score: 79,
      firHit: 8,
      girHit: 10,
      putts: 31,
      penalties: 0,
      teeSegment: 'full',
      tee: makeTee(),
      roundHoles: [],
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        return [
          { id: BigInt(401), score: 90, date: new Date('2026-09-01T08:00:00.000Z') },
          { id: BigInt(402), score: 86, date: new Date('2026-09-02T08:00:00.000Z') },
          { id: BigInt(403), score: 79, date: new Date('2026-09-03T18:00:00.000Z') },
        ];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [
          { id: BigInt(402), score: 86, date: new Date('2026-09-02T08:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
          { id: BigInt(401), score: 90, date: new Date('2026-09-01T08:00:00.000Z'), teeSegment: 'full', tee: makeTee() },
        ];
      }
      return [];
    });

    await generateInsights(
      BigInt(403),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: BigInt(403) },
          date: { lt: new Date('2026-09-03T18:00:00.000Z') },
        }),
      }),
    );
  });

  it('excludes same-timestamp rounds from historical baseline scope', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(501),
      userId: BigInt(1),
      date: new Date('2026-10-01T12:00:00.000Z'),
      score: 83,
      firHit: 7,
      girHit: 8,
      putts: 33,
      penalties: 1,
      teeSegment: 'full',
      tee: makeTee(),
      roundHoles: [],
    });
    mockedPrisma.round.findMany.mockReset();
    mockedPrisma.round.findMany.mockImplementation(async (args: any) => {
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'asc') {
        // Same timestamp round id 502 should be excluded by strict lt scope.
        return [{ id: BigInt(501), score: 83, date: new Date('2026-10-01T12:00:00.000Z') }];
      }
      if (Array.isArray(args?.orderBy) && args.orderBy[0]?.date === 'desc') {
        return [];
      }
      return [];
    });

    const insights = await generateInsights(
      BigInt(501),
      BigInt(1),
      { isPremium: true },
      { forceRegenerate: true },
    );

    expect(mockedPrisma.round.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { date: { lt: new Date('2026-10-01T12:00:00.000Z') } },
            { id: BigInt(501) },
          ],
        }),
      }),
    );
    expect(insights.round_number).toBe(1);
    const savedInsights = mockedPrisma.roundInsight.upsert.mock.calls[0][0].create.insights;
    expect(savedInsights.raw_payload?.historical?.avg_score).toBeNull();
  });
});



