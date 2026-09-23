import 'server-only';

import { LiveRoundSessionStatus, type Prisma, type PrismaClient, type TeeGender } from '@prisma/client';
import { RECONCILIATION_PROVIDER, type ReconciliationGender } from './types';

export type ReconciliationDbClient = PrismaClient | Prisma.TransactionClient;

export type LocalCourseState = {
  id: bigint;
  clubName: string;
  courseName: string;
  updatedAt: Date;
  externalIds: Array<{
    id: bigint;
    provider: string;
    externalId: string;
    createdAt: Date;
    lastSeenAt: Date;
  }>;
  tees: Array<{
    id: bigint;
    courseId: bigint;
    gender: TeeGender;
    teeName: string;
    courseRating: Prisma.Decimal | null;
    slopeRating: number | null;
    totalYards: number | null;
    totalMeters: number | null;
    numberOfHoles: number | null;
    parTotal: number | null;
    nonPar3Holes: number;
    updatedAt: Date;
    holes: Array<{
      id: bigint;
      teeId: bigint;
      holeNumber: number;
      par: number;
      yardage: number;
      handicap: number | null;
      updatedAt: Date;
    }>;
    completedRoundCount: number;
    activeLiveSessionCount: number;
  }>;
};

export async function loadLocalCourseState(
  client: ReconciliationDbClient,
  courseId: bigint,
): Promise<LocalCourseState | null> {
  const course = await client.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      clubName: true,
      courseName: true,
      updatedAt: true,
      externalIds: {
        where: { provider: RECONCILIATION_PROVIDER },
        select: {
          id: true,
          provider: true,
          externalId: true,
          createdAt: true,
          lastSeenAt: true,
        },
        orderBy: { id: 'asc' },
      },
      tees: {
        select: {
          id: true,
          courseId: true,
          gender: true,
          teeName: true,
          courseRating: true,
          slopeRating: true,
          totalYards: true,
          totalMeters: true,
          numberOfHoles: true,
          parTotal: true,
          nonPar3Holes: true,
          updatedAt: true,
          holes: {
            select: {
              id: true,
              teeId: true,
              holeNumber: true,
              par: true,
              yardage: true,
              handicap: true,
              updatedAt: true,
            },
            orderBy: [{ holeNumber: 'asc' }, { id: 'asc' }],
          },
          _count: {
            select: {
              rounds: true,
              liveRoundSessions: { where: { status: LiveRoundSessionStatus.ACTIVE } },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!course) return null;

  return {
    ...course,
    tees: course.tees.map(({ _count, ...tee }) => ({
      ...tee,
      completedRoundCount: _count.rounds,
      activeLiveSessionCount: _count.liveRoundSessions,
    })),
  };
}

export function toReconciliationGender(gender: TeeGender): ReconciliationGender {
  return gender === 'female' ? 'female' : 'male';
}

export function serializeLocalSnapshot(state: LocalCourseState) {
  return {
    id: state.id.toString(),
    clubName: state.clubName,
    courseName: state.courseName,
    updatedAt: state.updatedAt.toISOString(),
    externalIds: state.externalIds.map((external) => ({
      id: external.id.toString(),
      provider: external.provider,
      externalId: external.externalId,
      createdAt: external.createdAt.toISOString(),
      lastSeenAt: external.lastSeenAt.toISOString(),
    })),
    tees: state.tees.map((tee) => ({
      id: tee.id.toString(),
      courseId: tee.courseId.toString(),
      gender: tee.gender,
      teeName: tee.teeName,
      courseRating: tee.courseRating?.toString() ?? null,
      slopeRating: tee.slopeRating,
      totalYards: tee.totalYards,
      totalMeters: tee.totalMeters,
      numberOfHoles: tee.numberOfHoles,
      parTotal: tee.parTotal,
      nonPar3Holes: tee.nonPar3Holes,
      updatedAt: tee.updatedAt.toISOString(),
      holes: tee.holes.map((hole) => ({
        id: hole.id.toString(),
        teeId: hole.teeId.toString(),
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage,
        handicap: hole.handicap,
        updatedAt: hole.updatedAt.toISOString(),
      })),
    })),
  };
}
