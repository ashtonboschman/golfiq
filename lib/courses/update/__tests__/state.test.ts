jest.mock('server-only', () => ({}), { virtual: true });

import { LiveRoundSessionStatus, Prisma } from '@prisma/client';
import {
  loadLocalCourseState,
  serializeLocalSnapshot,
  type ReconciliationDbClient,
} from '@/lib/courses/update/state';

describe('course reconciliation local state', () => {
  it('counts only ACTIVE live sessions while retaining completed-round usage', async () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    const findUnique = jest.fn().mockResolvedValue({
      id: BigInt(1),
      clubName: 'Club',
      courseName: 'Course',
      updatedAt: now,
      externalIds: [],
      tees: [{
        id: BigInt(10),
        courseId: BigInt(1),
        gender: 'male',
        teeName: 'Blue',
        courseRating: new Prisma.Decimal(35),
        slopeRating: 115,
        totalYards: 2700,
        totalMeters: 2469,
        numberOfHoles: 9,
        parTotal: 36,
        nonPar3Holes: 9,
        updatedAt: now,
        holes: [],
        _count: { rounds: 8, liveRoundSessions: 1 },
      }],
    });
    const client = { course: { findUnique } } as unknown as ReconciliationDbClient;

    const state = await loadLocalCourseState(client, BigInt(1));

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        tees: expect.objectContaining({
          select: expect.objectContaining({
            _count: {
              select: {
                rounds: true,
                liveRoundSessions: { where: { status: LiveRoundSessionStatus.ACTIVE } },
              },
            },
          }),
        }),
      }),
    }));
    expect(state?.tees[0]).toMatchObject({
      completedRoundCount: 8,
      activeLiveSessionCount: 1,
    });
  });

  it('does not include usage counters in the mutable course snapshot hash input', async () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    const base = {
      id: BigInt(1),
      clubName: 'Club',
      courseName: 'Course',
      updatedAt: now,
      externalIds: [],
      tees: [{
        id: BigInt(10),
        courseId: BigInt(1),
        gender: 'male' as const,
        teeName: 'Blue',
        courseRating: new Prisma.Decimal(35),
        slopeRating: 115,
        totalYards: 2700,
        totalMeters: 2469,
        numberOfHoles: 9,
        parTotal: 36,
        nonPar3Holes: 9,
        updatedAt: now,
        holes: [],
        completedRoundCount: 0,
        activeLiveSessionCount: 0,
      }],
    };
    const withUsage = {
      ...base,
      tees: [{ ...base.tees[0], completedRoundCount: 9, activeLiveSessionCount: 1 }],
    };

    expect(serializeLocalSnapshot(base)).toEqual(serializeLocalSnapshot(withUsage));
  });
});
