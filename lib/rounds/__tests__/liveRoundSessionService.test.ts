import { prisma } from '@/lib/db';
import { createCompletedRoundFromInput } from '@/lib/rounds/finalizeRound';
import { getValidTeeSegments, resolveTeeContext } from '@/lib/tee/resolveTeeContext';
import { getLiveGpsAvailabilityForCourse } from '@/lib/gps/liveMapping';
import {
  createLiveRoundSession,
  discardLiveRoundSession,
  finalizeLiveRoundSession,
  getLiveRoundSession,
  LiveRoundSessionError,
  saveLiveRoundHoleDraft,
  updateLiveRoundNavigation,
} from '@/lib/rounds/liveRoundSessionService';

jest.mock('@/lib/db', () => ({
  prisma: {
    tee: {
      findFirst: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
    },
    liveRoundSession: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    liveRoundHoleDraft: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/rounds/finalizeRound', () => ({
  ROUND_CONTEXT_VALUES: ['real', 'simulator', 'practice'],
  ROUND_MISS_DIRECTION_VALUES: ['hit', 'miss_left', 'miss_right', 'miss_short', 'miss_long'],
  CompletedRoundFinalizationError: class CompletedRoundFinalizationError extends Error {
    status = 400;
    failureStage = 'validation';
    errorCode = 'validation_failed';
  },
  createCompletedRoundFromInput: jest.fn(),
}));

jest.mock('@/lib/tee/resolveTeeContext', () => ({
  getValidTeeSegments: jest.fn(),
  resolveTeeContext: jest.fn(),
}));

jest.mock('@/lib/gps/liveMapping', () => ({
  getLiveGpsAvailabilityForCourse: jest.fn(),
}));

type MockPrisma = {
  tee: {
    findFirst: jest.Mock;
  };
  userProfile: {
    findUnique: jest.Mock;
  };
  liveRoundSession: {
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  liveRoundHoleDraft: {
    createMany: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

const mockedPrisma = prisma as unknown as MockPrisma;
const mockedGetValidTeeSegments = getValidTeeSegments as jest.Mock;
const mockedResolveTeeContext = resolveTeeContext as jest.Mock;
const mockedGetLiveGpsAvailabilityForCourse = getLiveGpsAvailabilityForCourse as jest.Mock;
const mockedCreateCompletedRoundFromInput = createCompletedRoundFromInput as jest.Mock;

const now = new Date('2026-06-26T12:00:00.000Z');

function makeHole(holeNumber: number) {
  return {
    id: BigInt(100 + holeNumber),
    holeNumber,
    par: 4,
    yardage: 400,
    handicap: holeNumber,
  };
}

function makeTee(numberOfHoles = 18, holeCount = numberOfHoles) {
  return {
    id: BigInt(12),
    courseId: BigInt(11),
    numberOfHoles,
    courseRating: 72,
    slopeRating: 120,
    bogeyRating: null,
    parTotal: numberOfHoles === 9 ? 36 : 72,
    nonPar3Holes: numberOfHoles === 9 ? 7 : 14,
    frontCourseRating: 36,
    frontSlopeRating: 118,
    frontBogeyRating: null,
    backCourseRating: 36,
    backSlopeRating: 122,
    backBogeyRating: null,
    teeName: 'Blue',
    gender: 'male',
    course: {
      id: BigInt(11),
      clubName: 'GolfIQ Club',
      courseName: 'North',
    },
    holes: Array.from({ length: holeCount }, (_, index) => makeHole(index + 1)),
  };
}

function makeDraft(holeNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(1000 + holeNumber),
    sessionId: BigInt(500),
    holeId: BigInt(100 + holeNumber),
    holeNumber,
    displayHoleNumber: holeNumber,
    pass: 1,
    score: 4,
    firHit: null,
    firDirection: null,
    girHit: null,
    girDirection: null,
    putts: 2,
    penalties: 0,
    chips: null,
    greensideBunkerShots: null,
    createdAt: now,
    updatedAt: now,
    hole: makeHole(holeNumber),
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(500),
    userId: BigInt(1),
    courseId: BigInt(11),
    teeId: BigInt(12),
    finalRoundId: null,
    status: 'ACTIVE',
    date: new Date('2026-06-26T00:00:00.000Z'),
    teeSegment: 'full',
    roundContext: 'real',
    notes: null,
    startHoleNumber: 1,
    activeHoleNumber: 1,
    activeHolePass: 1,
    activeStep: 'SCORE',
    gpsEnabled: false,
    liveRoundTrackFir: true,
    liveRoundTrackGir: true,
    liveRoundTrackChips: true,
    liveRoundTrackGreensideBunkerShots: true,
    liveRoundTrackPutts: true,
    liveRoundTrackPenalties: true,
    startedAt: now,
    lastSavedAt: now,
    completedAt: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
    course: {
      id: BigInt(11),
      clubName: 'GolfIQ Club',
      courseName: 'North',
    },
    tee: makeTee(18, 2),
    finalRound: null,
    holeDrafts: [makeDraft(1), makeDraft(2)],
    ...overrides,
  };
}

describe('liveRoundSessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedResolveTeeContext.mockReturnValue({
      holes: 2,
      parTotal: 8,
      nonPar3Holes: 2,
      courseRating: 72,
      slopeRating: 120,
      holeRange: [1, 2],
    });
    mockedGetValidTeeSegments.mockReturnValue([
      { value: 'full', label: '18 Holes' },
      { value: 'front9', label: 'Front 9' },
      { value: 'back9', label: 'Back 9' },
    ]);
    mockedPrisma.userProfile.findUnique.mockResolvedValue({
      liveRoundTrackFir: true,
      liveRoundTrackGir: false,
      liveRoundTrackChips: true,
      liveRoundTrackGreensideBunkerShots: true,
      liveRoundTrackPutts: true,
      liveRoundTrackPenalties: false,
    });
    mockedPrisma.$queryRaw.mockResolvedValue([]);
    mockedGetLiveGpsAvailabilityForCourse.mockResolvedValue({
      courseId: '11',
      available: true,
      coverage: 'full',
      expectedHoleNumbers: [1, 2],
      availableHoleNumbers: [1, 2],
      unavailableHoleNumbers: [],
      reason: 'available',
    });
    mockedPrisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: MockPrisma) => unknown)(mockedPrisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  it('creates an active session with expected draft holes and tracking prefs', async () => {
    const tee = makeTee(18, 2);
    mockedPrisma.tee.findFirst.mockResolvedValue(tee);
    mockedPrisma.liveRoundSession.create.mockResolvedValue(makeSession());

    const result = await createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      tee_segment: 'full',
    });

    expect(mockedPrisma.liveRoundSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: BigInt(1),
          courseId: BigInt(11),
          teeId: BigInt(12),
          startHoleNumber: 1,
          activeHoleNumber: 1,
          activeStep: 'SCORE',
          gpsEnabled: false,
          liveRoundTrackGir: false,
          liveRoundTrackPenalties: false,
          holeDrafts: {
            create: [
              expect.objectContaining({ holeId: BigInt(101), holeNumber: 1, displayHoleNumber: 1, pass: 1 }),
              expect.objectContaining({ holeId: BigInt(102), holeNumber: 2, displayHoleNumber: 2, pass: 1 }),
            ],
          },
        }),
      }),
    );
    expect(result.session.id).toBe('500');
    expect(result.session.gpsEnabled).toBe(false);
    expect(result.session.active_step).toBe('SCORE');
    expect(mockedGetLiveGpsAvailabilityForCourse).not.toHaveBeenCalled();
  });

  it('creates a GPS-enabled session with full published coverage and starts on GPS', async () => {
    mockedPrisma.tee.findFirst.mockResolvedValue(makeTee(18, 2));
    mockedPrisma.liveRoundSession.create.mockResolvedValue(makeSession({
      gpsEnabled: true,
      activeStep: 'GPS',
    }));

    const result = await createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      tee_segment: 'full',
      gpsEnabled: true,
    });

    expect(mockedGetLiveGpsAvailabilityForCourse).toHaveBeenCalledWith(BigInt(11));
    expect(mockedPrisma.liveRoundSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gpsEnabled: true,
          activeStep: 'GPS',
        }),
      }),
    );
    expect(result.session.gpsEnabled).toBe(true);
    expect(result.session.active_step).toBe('GPS');
  });

  it.each([
    { coverage: 'none', availableHoleNumbers: [], unavailableHoleNumbers: [1, 2] },
    { coverage: 'partial', availableHoleNumbers: [1], unavailableHoleNumbers: [2] },
  ])('rejects GPS when course coverage is $coverage', async (availability) => {
    mockedPrisma.tee.findFirst.mockResolvedValue(makeTee(18, 2));
    mockedGetLiveGpsAvailabilityForCourse.mockResolvedValue({
      courseId: '11',
      available: false,
      expectedHoleNumbers: [1, 2],
      reason: 'incomplete_mapping',
      ...availability,
    });

    await expect(createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      gpsEnabled: true,
    })).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 400,
      code: 'gps_unavailable',
      message: 'Live GPS is not available for this course yet.',
    });
    expect(mockedPrisma.liveRoundSession.create).not.toHaveBeenCalled();
  });

  it('starts a live round on the requested playable hole', async () => {
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 18,
      parTotal: 72,
      nonPar3Holes: 14,
      courseRating: 72,
      slopeRating: 120,
      holeRange: Array.from({ length: 18 }, (_, index) => index + 1),
    });
    mockedPrisma.tee.findFirst.mockResolvedValue(makeTee(18, 18));
    mockedPrisma.liveRoundSession.create.mockResolvedValue(makeSession({
      startHoleNumber: 7,
      activeHoleNumber: 7,
      activeHolePass: 1,
    }));

    const result = await createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      tee_segment: 'full',
      start_hole_number: 7,
    });

    expect(mockedPrisma.liveRoundSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startHoleNumber: 7,
          activeHoleNumber: 7,
          activeHolePass: 1,
        }),
      }),
    );
    expect(result.session.start_hole_number).toBe(7);
    expect(result.session.active_hole_number).toBe(7);
  });

  it('rejects a requested starting hole outside the selected segment', async () => {
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 9,
      parTotal: 36,
      nonPar3Holes: 7,
      courseRating: 36,
      slopeRating: 120,
      holeRange: [10, 11, 12, 13, 14, 15, 16, 17, 18],
    });
    mockedPrisma.tee.findFirst.mockResolvedValue(makeTee(18, 18));

    await expect(createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      tee_segment: 'back9',
      start_hole_number: 7,
    })).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 400,
      code: 'invalid_start_hole',
    });
    expect(mockedPrisma.liveRoundSession.create).not.toHaveBeenCalled();
  });

  it('uses request tracking prefs when provided for a new session', async () => {
    mockedPrisma.tee.findFirst.mockResolvedValue(makeTee(18, 2));
    mockedPrisma.liveRoundSession.create.mockResolvedValue(makeSession());

    await createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      tee_segment: 'full',
      tracking_prefs: {
        fir: false,
        gir: true,
        chips: false,
        greenside_bunker_shots: false,
        putts: true,
        penalties: true,
      },
    });

    expect(mockedPrisma.liveRoundSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          liveRoundTrackFir: false,
          liveRoundTrackGir: true,
          liveRoundTrackChips: false,
          liveRoundTrackGreensideBunkerShots: false,
          liveRoundTrackPutts: true,
          liveRoundTrackPenalties: true,
        }),
      }),
    );
  });

  it('creates double9 drafts using pass 2 for display holes 10 through 18', async () => {
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 18,
      parTotal: 72,
      nonPar3Holes: 14,
      courseRating: 72,
      slopeRating: 120,
      holeRange: Array.from({ length: 18 }, (_, index) => index + 1),
    });
    mockedPrisma.tee.findFirst.mockResolvedValue(makeTee(9, 9));
    mockedPrisma.liveRoundSession.create.mockResolvedValue(makeSession({ teeSegment: 'double9' }));

    await createLiveRoundSession(BigInt(1), {
      course_id: 11,
      tee_id: 12,
      date: '2026-06-26',
      tee_segment: 'double9',
    });

    const createRows = mockedPrisma.liveRoundSession.create.mock.calls[0][0].data.holeDrafts.create;
    expect(createRows).toHaveLength(18);
    expect(createRows[0]).toEqual(expect.objectContaining({ holeId: BigInt(101), displayHoleNumber: 1, pass: 1 }));
    expect(createRows[9]).toEqual(expect.objectContaining({ holeId: BigInt(101), displayHoleNumber: 10, pass: 2 }));
    expect(createRows[17]).toEqual(expect.objectContaining({ holeId: BigInt(109), displayHoleNumber: 18, pass: 2 }));
  });

  it('saves nullable hole draft stats and bumps lastSavedAt without requiring a completed round', async () => {
    const session = makeSession();
    const updatedDraft = makeDraft(1, { score: null, putts: null });
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(session);
    mockedPrisma.liveRoundHoleDraft.findFirst.mockResolvedValue(makeDraft(1));
    mockedPrisma.liveRoundHoleDraft.update.mockResolvedValue(updatedDraft);
    mockedPrisma.liveRoundSession.update.mockResolvedValue(session);

    const result = await saveLiveRoundHoleDraft(BigInt(1), '500', {
      hole_id: 101,
      pass: 1,
      score: null,
      putts: null,
      penalties: 0,
    });

    expect(mockedPrisma.liveRoundHoleDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          score: null,
          putts: null,
          penalties: 0,
        }),
      }),
    );
    expect(result.draft.score).toBeNull();
    expect(mockedCreateCompletedRoundFromInput).not.toHaveBeenCalled();
  });

  it('rechecks active status under the session lock before saving a hole draft', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(null);

    await expect(saveLiveRoundHoleDraft(BigInt(1), '500', {
      draft_id: 1001,
      score: 5,
    })).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 404,
      code: 'session_not_found',
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockedPrisma.liveRoundSession.findFirst.mock.invocationCallOrder[0],
    );
    expect(mockedPrisma.liveRoundHoleDraft.update).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundSession.update).not.toHaveBeenCalled();
  });

  it('does not expose another user session', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(null);

    await expect(getLiveRoundSession(BigInt(2), '500')).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 404,
      code: 'session_not_found',
    });
  });

  it('includes gpsEnabled in a live session response', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(makeSession({ gpsEnabled: true }));

    const result = await getLiveRoundSession(BigInt(1), '500');

    expect(result.session.gpsEnabled).toBe(true);
  });

  it('discards only active owned sessions', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(makeSession());

    const result = await discardLiveRoundSession(BigInt(1), '500');

    expect(mockedPrisma.liveRoundSession.delete).toHaveBeenCalledWith({
      where: { id: BigInt(500) },
    });
    expect(mockedPrisma.liveRoundSession.update).not.toHaveBeenCalled();
    expect(result.session.status).toBe('DISCARDED');
    expect(result.session.discarded_at).not.toBeNull();
  });

  it('updates live round review details before finalization', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(makeSession());
    mockedPrisma.liveRoundSession.update.mockResolvedValue(makeSession({
      roundContext: 'practice',
      notes: 'Worked on wedges',
    }));

    const result = await updateLiveRoundNavigation(BigInt(1), '500', {
      round_context: 'practice',
      notes: '  Worked on wedges  ',
    });

    expect(mockedPrisma.liveRoundSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BigInt(500) },
        data: expect.objectContaining({
          roundContext: 'practice',
          notes: 'Worked on wedges',
          lastSavedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.session.round_context).toBe('practice');
    expect(result.session.notes).toBe('Worked on wedges');
  });

  it('expands a front 9 live round to 18 holes without losing existing front scores', async () => {
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 18,
      parTotal: 72,
      nonPar3Holes: 14,
      courseRating: 72,
      slopeRating: 120,
      holeRange: Array.from({ length: 18 }, (_, index) => index + 1),
    });
    const frontDrafts = Array.from({ length: 9 }, (_, index) => makeDraft(index + 1));
    const session = makeSession({
      tee: makeTee(18, 18),
      teeSegment: 'front9',
      activeHoleNumber: 9,
      holeDrafts: frontDrafts,
    });
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(session);
    mockedPrisma.liveRoundSession.update.mockResolvedValue(makeSession({
      ...session,
      teeSegment: 'full',
      holeDrafts: [
        ...frontDrafts,
        ...Array.from({ length: 9 }, (_, index) => makeDraft(index + 10, { score: null })),
      ],
    }));

    await updateLiveRoundNavigation(BigInt(1), '500', {
      tee_segment: 'full',
    });

    expect(mockedPrisma.liveRoundHoleDraft.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: BigInt(500),
        NOT: {
          OR: expect.arrayContaining([
            { holeId: BigInt(101), pass: 1 },
            { holeId: BigInt(118), pass: 1 },
          ]),
        },
      },
    });
    expect(mockedPrisma.liveRoundHoleDraft.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ sessionId: BigInt(500), holeId: BigInt(110), displayHoleNumber: 10, pass: 1 }),
        expect.objectContaining({ sessionId: BigInt(500), holeId: BigInt(118), displayHoleNumber: 18, pass: 1 }),
      ]),
    });
    expect(mockedPrisma.liveRoundHoleDraft.createMany.mock.calls[0][0].data).toHaveLength(9);
    expect(mockedPrisma.liveRoundSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teeSegment: 'full',
          startHoleNumber: 1,
          activeHoleNumber: 9,
          activeHolePass: 1,
        }),
      }),
    );
  });

  it('trims an 18-hole live round to the front 9 and moves the active hole back into range', async () => {
    mockedResolveTeeContext.mockReturnValueOnce({
      holes: 9,
      parTotal: 36,
      nonPar3Holes: 7,
      courseRating: 36,
      slopeRating: 118,
      holeRange: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    const fullDrafts = Array.from({ length: 18 }, (_, index) => makeDraft(index + 1));
    const session = makeSession({
      tee: makeTee(18, 18),
      activeHoleNumber: 12,
      holeDrafts: fullDrafts,
    });
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(session);
    mockedPrisma.liveRoundSession.update.mockResolvedValue(makeSession({
      ...session,
      teeSegment: 'front9',
      activeHoleNumber: 1,
      holeDrafts: fullDrafts.slice(0, 9),
    }));

    await updateLiveRoundNavigation(BigInt(1), '500', {
      tee_segment: 'front9',
    });

    expect(mockedPrisma.liveRoundHoleDraft.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: BigInt(500),
        NOT: {
          OR: [
            { holeId: BigInt(101), pass: 1 },
            { holeId: BigInt(102), pass: 1 },
            { holeId: BigInt(103), pass: 1 },
            { holeId: BigInt(104), pass: 1 },
            { holeId: BigInt(105), pass: 1 },
            { holeId: BigInt(106), pass: 1 },
            { holeId: BigInt(107), pass: 1 },
            { holeId: BigInt(108), pass: 1 },
            { holeId: BigInt(109), pass: 1 },
          ],
        },
      },
    });
    expect(mockedPrisma.liveRoundHoleDraft.createMany).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teeSegment: 'front9',
          startHoleNumber: 1,
          activeHoleNumber: 1,
          activeHolePass: 1,
        }),
      }),
    );
  });

  it('rechecks active status under the session lock before updating review details', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(null);

    await expect(updateLiveRoundNavigation(BigInt(1), '500', {
      notes: 'Too late',
    })).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 404,
      code: 'session_not_found',
    });

    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.liveRoundSession.update).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundSession.delete).not.toHaveBeenCalled();
  });

  it('rechecks active status under the session lock before discarding', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(null);

    await expect(discardLiveRoundSession(BigInt(1), '500')).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 404,
      code: 'session_not_found',
    });

    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.liveRoundSession.update).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundSession.delete).not.toHaveBeenCalled();
  });

  it('rejects finalization when any draft score is missing', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(makeSession({
      holeDrafts: [makeDraft(1), makeDraft(2, { score: null })],
    }));

    await expect(finalizeLiveRoundSession(BigInt(1), '500')).rejects.toMatchObject({
      name: 'LiveRoundSessionError',
      status: 400,
      code: 'missing_hole_score',
    });
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5_000, timeout: 30_000 },
    );
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedCreateCompletedRoundFromInput).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundSession.update).not.toHaveBeenCalled();
  });

  it('finalizes complete drafts through the shared completed-round helper', async () => {
    const runPostCommitSideEffects = jest.fn().mockResolvedValue(undefined);
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(makeSession());
    mockedCreateCompletedRoundFromInput.mockResolvedValue({
      roundId: BigInt(900),
      runPostCommitSideEffects,
    });
    mockedPrisma.liveRoundSession.update.mockResolvedValue(makeSession({
      status: 'COMPLETED',
      finalRoundId: BigInt(900),
      completedAt: now,
    }));

    const result = await finalizeLiveRoundSession(BigInt(1), '500');

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedCreateCompletedRoundFromInput).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BigInt(1),
        db: mockedPrisma,
        deferPostCommitSideEffects: true,
        input: expect.objectContaining({
          course_id: '11',
          tee_id: '12',
          hole_by_hole: 1,
          round_holes: [
            expect.objectContaining({ hole_id: '101', pass: 1, score: 4 }),
            expect.objectContaining({ hole_id: '102', pass: 1, score: 4 }),
          ],
        }),
      }),
    );
    expect(mockedCreateCompletedRoundFromInput).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.liveRoundSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BigInt(500) },
        data: expect.objectContaining({
          status: 'COMPLETED',
          finalRoundId: BigInt(900),
          completedAt: expect.any(Date),
          lastSavedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockedPrisma.liveRoundHoleDraft.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: BigInt(500) },
    });
    expect(runPostCommitSideEffects).toHaveBeenCalledTimes(1);
    expect(result.roundId).toBe('900');
    expect(result.session.status).toBe('COMPLETED');
    expect(result.session.hole_drafts).toEqual([]);
  });

  it('returns the completed round for repeated finalize calls', async () => {
    mockedPrisma.liveRoundSession.findFirst.mockResolvedValue(makeSession({
      status: 'COMPLETED',
      finalRoundId: BigInt(900),
    }));

    const result = await finalizeLiveRoundSession(BigInt(1), '500');

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.roundId).toBe('900');
    expect(mockedCreateCompletedRoundFromInput).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundSession.update).not.toHaveBeenCalled();
    expect(mockedPrisma.liveRoundHoleDraft.deleteMany).not.toHaveBeenCalled();
  });

  it('does not create duplicate completed rounds when a later finalize sees the completed session', async () => {
    const runPostCommitSideEffects = jest.fn().mockResolvedValue(undefined);
    mockedPrisma.liveRoundSession.findFirst
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValueOnce(makeSession({
        status: 'COMPLETED',
        finalRoundId: BigInt(900),
      }));
    mockedCreateCompletedRoundFromInput.mockResolvedValue({
      roundId: BigInt(900),
      runPostCommitSideEffects,
    });
    mockedPrisma.liveRoundSession.update.mockResolvedValue(makeSession({
      status: 'COMPLETED',
      finalRoundId: BigInt(900),
      completedAt: now,
    }));

    const first = await finalizeLiveRoundSession(BigInt(1), '500');
    const second = await finalizeLiveRoundSession(BigInt(1), '500');

    expect(first.roundId).toBe('900');
    expect(second.roundId).toBe('900');
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mockedCreateCompletedRoundFromInput).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.liveRoundSession.update).toHaveBeenCalledTimes(1);
  });

  it('throws LiveRoundSessionError for invalid session ids', async () => {
    await expect(getLiveRoundSession(BigInt(1), 'abc')).rejects.toBeInstanceOf(LiveRoundSessionError);
  });
});
