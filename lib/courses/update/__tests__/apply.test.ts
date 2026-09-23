jest.mock('server-only', () => ({}), { virtual: true });

const transactionMock = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: { $transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('@/lib/courses/update/provider', () => ({
  fetchNormalizedGolfCourseApiCourse: jest.fn(),
}));

import { Prisma } from '@prisma/client';
import { applyCourseReconciliation } from '@/lib/courses/update/apply';
import { hashReconciliationSnapshot } from '@/lib/courses/update/hash';
import { normalizeGolfCourseApiCourse } from '@/lib/courses/update/normalize';
import { fetchNormalizedGolfCourseApiCourse } from '@/lib/courses/update/provider';
import { serializeLocalSnapshot, type LocalCourseState } from '@/lib/courses/update/state';
import type { ApplyReconciliationRequest } from '@/lib/courses/update/types';

const mockedProvider = fetchNormalizedGolfCourseApiCourse as jest.MockedFunction<typeof fetchNormalizedGolfCourseApiCourse>;

function state({
  completedRounds = 0,
  activeLiveSessions = 0,
}: {
  completedRounds?: number;
  activeLiveSessions?: number;
} = {}): LocalCourseState {
  const now = new Date('2026-09-18T12:00:00.000Z');
  return {
    id: BigInt(1), clubName: 'Club', courseName: 'Course', updatedAt: now,
    externalIds: [{ id: BigInt(1), provider: 'golfcourseapi', externalId: '00hgpgma', createdAt: now, lastSeenAt: now }],
    tees: [{
      id: BigInt(10), courseId: BigInt(1), gender: 'male', teeName: 'Blue',
      courseRating: new Prisma.Decimal(35), slopeRating: 115, totalYards: 2700,
      totalMeters: 2469, numberOfHoles: 9, parTotal: 36, nonPar3Holes: 9, updatedAt: now,
      holes: Array.from({ length: 9 }, (_, index) => ({
        id: BigInt(100 + index), teeId: BigInt(10), holeNumber: index + 1,
        par: 4, yardage: 300, handicap: index + 1, updatedAt: now,
      })),
      completedRoundCount: completedRounds,
      activeLiveSessionCount: activeLiveSessions,
    }],
  };
}

function provider() {
  return normalizeGolfCourseApiCourse({
    id: '00hgpgma', club_name: 'Club', course_name: 'Course',
    tees: { male: [{
      tee_name: 'Blue', course_rating: 34, slope_rating: 110,
      total_yards: 2700, total_meters: 2469, number_of_holes: 9, par_total: 36,
      holes: Array.from({ length: 9 }, (_, index) => ({ par: 4, yardage: 300, handicap: index + 1 })),
    }], female: [] },
  }, '00hgpgma');
}

function harness(local = state()) {
  const queryResult = {
    ...local,
    tees: local.tees.map(({ completedRoundCount, activeLiveSessionCount, ...tee }) => ({
      ...tee,
      _count: { rounds: completedRoundCount, liveRoundSessions: activeLiveSessionCount },
    })),
  };
  const tx = {
    course: { findUnique: jest.fn().mockResolvedValue(queryResult) },
    tee: { update: jest.fn(), create: jest.fn().mockResolvedValue({ id: BigInt(99) }) },
    hole: { update: jest.fn() },
    courseReconciliationAudit: { create: jest.fn() },
  };
  transactionMock.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  return tx;
}

function request(local = state(), normalized = provider()): ApplyReconciliationRequest {
  return {
    schemaVersion: 1,
    courseId: '1',
    provider: 'golfcourseapi',
    externalCourseId: '00hgpgma',
    base: {
      comparedAt: '2026-09-18T12:00:00.000Z',
      localSnapshotHash: hashReconciliationSnapshot(serializeLocalSnapshot(local)),
      providerSnapshotHash: hashReconciliationSnapshot(normalized),
    },
    matchedTeeUpdates: [{
      localTeeId: '10', providerTeeKey: normalized.tees[0].providerTeeKey,
      take: { courseRating: true },
    }],
    newTees: [],
  };
}

describe('applyCourseReconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates only selected fields and writes exactly one audit in the transaction', async () => {
    const local = state();
    const normalized = provider();
    const tx = harness(local);
    mockedProvider.mockResolvedValue(normalized);

    const result = await applyCourseReconciliation(request(local, normalized), BigInt(1));

    expect(tx.tee.update).toHaveBeenCalledWith({
      where: { id: BigInt(10) },
      data: { courseRating: 34 },
    });
    expect(tx.hole.update).not.toHaveBeenCalled();
    expect(tx.courseReconciliationAudit.create).toHaveBeenCalledTimes(1);
    expect(tx.courseReconciliationAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ adminUserId: BigInt(1), externalCourseId: '00hgpgma' }),
    }));
    expect(result.appliedChanges).toBe(1);
  });

  it('allows completed-round usage and updates the existing tee in place', async () => {
    const local = state({ completedRounds: 5 });
    const normalized = provider();
    const tx = harness(local);
    mockedProvider.mockResolvedValue(normalized);

    await expect(applyCourseReconciliation(request(local, normalized), BigInt(1))).resolves.toMatchObject({
      appliedChanges: 1,
      createdTeeIds: [],
    });
    expect(tx.tee.update).toHaveBeenCalledWith({
      where: { id: BigInt(10) },
      data: { courseRating: 34 },
    });
    expect(tx.tee.create).not.toHaveBeenCalled();
    expect(tx.courseReconciliationAudit.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { completedRounds: 0, activeLiveSessions: 1 },
    { completedRounds: 4, activeLiveSessions: 1 },
  ])('rejects active live-session usage server-side without an audit (%o)', async (usage) => {
    const local = state(usage);
    const normalized = provider();
    const tx = harness(local);
    mockedProvider.mockResolvedValue(normalized);

    await expect(applyCourseReconciliation(request(local, normalized), BigInt(1)))
      .rejects.toMatchObject({ status: 409, code: 'active_live_session_conflict' });
    expect(tx.tee.update).not.toHaveBeenCalled();
    expect(tx.courseReconciliationAudit.create).not.toHaveBeenCalled();
  });

  it('rejects when an active session appears after compare but before apply', async () => {
    const comparedState = state({ completedRounds: 2 });
    const transactionalState = state({ completedRounds: 2, activeLiveSessions: 1 });
    const normalized = provider();
    const tx = harness(transactionalState);
    mockedProvider.mockResolvedValue(normalized);

    await expect(applyCourseReconciliation(request(comparedState, normalized), BigInt(1)))
      .rejects.toMatchObject({ status: 409, code: 'active_live_session_conflict' });
    expect(tx.tee.update).not.toHaveBeenCalled();
    expect(tx.courseReconciliationAudit.create).not.toHaveBeenCalled();
  });

  it('creates a new tee with a generated ID and complete holes', async () => {
    const local = { ...state(), tees: [] };
    const normalized = provider();
    const tx = harness(local);
    mockedProvider.mockResolvedValue(normalized);
    const input = request(local, normalized);
    input.matchedTeeUpdates = [];
    input.newTees = [{ providerTeeKey: normalized.tees[0].providerTeeKey, add: true }];

    const result = await applyCourseReconciliation(input, BigInt(1));

    expect(tx.tee.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        courseId: BigInt(1),
        teeName: 'Blue',
        numberOfHoles: 9,
        holes: { create: expect.arrayContaining([expect.objectContaining({ holeNumber: 1 })]) },
      }),
    }));
    expect(tx.tee.create.mock.calls[0][0].data).not.toHaveProperty('id');
    expect(result.createdTeeIds).toEqual(['99']);
    expect(tx.courseReconciliationAudit.create).toHaveBeenCalledTimes(1);
    expect(tx.courseReconciliationAudit.create.mock.calls[0][0].data.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'new-tee',
        createdTeeId: '99',
        details: expect.objectContaining({ numberOfHoles: 9, totalYards: 2700 }),
      }),
    ]));
  });

  it('returns stale errors before writing for provider and local hash changes', async () => {
    const local = state();
    const normalized = provider();
    const tx = harness(local);
    mockedProvider.mockResolvedValue(normalized);
    const staleProvider = request(local, normalized);
    staleProvider.base.providerSnapshotHash = 'f'.repeat(64);
    await expect(applyCourseReconciliation(staleProvider, BigInt(1))).rejects.toMatchObject({ status: 409 });
    expect(transactionMock).not.toHaveBeenCalled();

    const staleLocal = request(local, normalized);
    staleLocal.base.localSnapshotHash = 'e'.repeat(64);
    await expect(applyCourseReconciliation(staleLocal, BigInt(1))).rejects.toMatchObject({ status: 409 });
    expect(tx.courseReconciliationAudit.create).not.toHaveBeenCalled();
  });
});
