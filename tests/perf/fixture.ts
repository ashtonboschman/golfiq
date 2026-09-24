import { prisma } from '@/lib/db';

export const PERF_SCALE = Object.freeze({
  courses: 60,
  teesPerCourse: 2,
  holesPerCourse: 27,
  friendCandidates: 31,
  searchableFriends: 30,
  rankedUsers: 80,
  rankedFriends: 30,
  realRounds: 60,
  simulatorRounds: 10,
  roundHolesPerRealRound: 18,
});

const viewerName = 'perf_viewer';
const coursePrefix = 'PerfCourse ';

function dateAt(index: number): Date {
  return new Date(Date.UTC(2026, 0, 1 + index, 12));
}

export async function ensurePerfFixture() {
  const [usersBefore, coursesBefore, roundsBefore] = await Promise.all([
    prisma.user.count(), prisma.course.count(), prisma.round.count(),
  ]);
  if (usersBefore === 0 && coursesBefore === 0 && roundsBefore === 0) {
    const users = [
      { username: viewerName, email: 'perf_viewer@golfiq.test', passwordHash: 'local-test-only' },
      ...Array.from({ length: PERF_SCALE.friendCandidates }, (_, i) => ({
        username: `perf_friend_${String(i + 1).padStart(2, '0')}`,
        email: `perf_friend_${String(i + 1).padStart(2, '0')}@golfiq.test`,
        passwordHash: 'local-test-only',
      })),
      ...Array.from({ length: PERF_SCALE.rankedUsers }, (_, i) => ({
        username: `perf_ranked_${String(i + 1).padStart(3, '0')}`,
        email: `perf_ranked_${String(i + 1).padStart(3, '0')}@golfiq.test`,
        passwordHash: 'local-test-only',
      })),
    ];
    await prisma.user.createMany({ data: users });
    const persistedUsers = await prisma.user.findMany({
      select: { id: true, username: true },
    });
    const byName = new Map(persistedUsers.map((user) => [user.username, user.id]));
    const viewerId = byName.get(viewerName)!;
    await prisma.userProfile.createMany({
      data: persistedUsers.map((user) => ({
        userId: user.id,
        firstName: user.username.startsWith('perf_friend_') ? 'PerfFriend' : 'Perf',
        lastName: user.username.startsWith('perf_friend_')
          ? (Number(user.username.slice(-2)) <= 5 ? `Small${user.username.slice(-2)}` : `Broad${user.username.slice(-2)}`)
          : user.username,
      })),
    });
    await prisma.userLeaderboardStats.createMany({
      data: [
        { userId: viewerId, handicap: 30, averageScore: 78, totalRounds: PERF_SCALE.realRounds },
        ...Array.from({ length: PERF_SCALE.rankedUsers }, (_, i) => ({
          userId: byName.get(`perf_ranked_${String(i + 1).padStart(3, '0')}`)!,
          handicap: Number((i / 2 + 1).toFixed(1)),
          averageScore: 70 + (i % 18),
          totalRounds: 5 + (i % 30),
        })),
      ],
    });
    const friendId = (index: number) => byName.get(`perf_friend_${String(index).padStart(2, '0')}`)!;
    await prisma.friend.createMany({
      data: [
        ...Array.from({ length: 5 }, (_, i) => ({ userId: viewerId, friendId: friendId(i + 1) })),
        ...Array.from({ length: PERF_SCALE.rankedFriends }, (_, i) => ({
          userId: viewerId,
          friendId: byName.get(`perf_ranked_${String(i + 1).padStart(3, '0')}`)!,
        })),
      ],
    });
    await prisma.friendRequest.createMany({
      data: [
        ...Array.from({ length: 5 }, (_, i) => ({ requesterId: viewerId, recipientId: friendId(i + 6) })),
        ...Array.from({ length: 5 }, (_, i) => ({ requesterId: friendId(i + 11), recipientId: viewerId })),
      ],
    });
    await prisma.userBlock.create({ data: { blockerId: viewerId, blockedUserId: friendId(31) } });

    await prisma.course.createMany({
      data: Array.from({ length: PERF_SCALE.courses }, (_, i) => ({
        clubName: `Perf Club ${String(i + 1).padStart(3, '0')}`,
        courseName: `${coursePrefix}${String(i + 1).padStart(3, '0')}`,
        verified: true,
      })),
    });
    const courses = await prisma.course.findMany({
      where: { courseName: { startsWith: coursePrefix } },
      select: { id: true, courseName: true },
      orderBy: { courseName: 'asc' },
    });
    await prisma.location.createMany({
      data: courses.map((course) => ({ courseId: course.id, city: 'PerfCity', state: 'MB', country: 'CA' })),
    });
    await prisma.tee.createMany({
      data: courses.flatMap((course) => [
        {
          courseId: course.id, gender: 'male' as const, teeName: 'Perf Nine',
          numberOfHoles: 9, parTotal: 36, nonPar3Holes: 9, courseRating: 36, slopeRating: 113,
        },
        {
          courseId: course.id, gender: 'female' as const, teeName: 'Perf Eighteen',
          numberOfHoles: 18, parTotal: 72, nonPar3Holes: 18, courseRating: 72, slopeRating: 113,
        },
      ]),
    });
    const tees = await prisma.tee.findMany({
      select: { id: true, courseId: true, numberOfHoles: true },
    });
    await prisma.hole.createMany({
      data: tees.flatMap((tee) => Array.from({ length: tee.numberOfHoles! }, (_, i) => ({
        teeId: tee.id, holeNumber: i + 1, par: 4, yardage: 350 + i,
      }))),
    });
    const dashboardTee = tees.find((tee) => tee.courseId === courses[0].id && tee.numberOfHoles === 18)!;
    await prisma.round.createMany({
      data: [
        ...Array.from({ length: PERF_SCALE.realRounds }, (_, i) => ({
          userId: viewerId, courseId: courses[0].id, teeId: dashboardTee.id,
          date: dateAt(i), score: 72 + (i % 5), toPar: i % 5,
          holesPlayed: 18, teeSegment: 'full', holeByHole: true, roundContext: 'real' as const,
          firHit: 12, girHit: 12, putts: 32, penalties: 1,
        })),
        ...Array.from({ length: PERF_SCALE.simulatorRounds }, (_, i) => ({
          userId: viewerId, courseId: courses[0].id, teeId: dashboardTee.id,
          date: dateAt(70 + i), score: 75, toPar: 3,
          holesPlayed: 18, teeSegment: 'full', holeByHole: false, roundContext: 'simulator' as const,
          firHit: 10, girHit: 10, putts: 34, penalties: 2,
        })),
      ],
    });
    const [realRounds, dashboardHoles] = await Promise.all([
      prisma.round.findMany({ where: { userId: viewerId, roundContext: 'real' }, select: { id: true, score: true } }),
      prisma.hole.findMany({ where: { teeId: dashboardTee.id }, select: { id: true, holeNumber: true }, orderBy: { holeNumber: 'asc' } }),
    ]);
    await prisma.roundHole.createMany({
      data: realRounds.flatMap((round) => dashboardHoles.map((hole) => ({
        roundId: round.id, holeId: hole.id, score: hole.holeNumber === 1 ? round.score - 68 : 4,
        firHit: 1, girHit: 1, putts: 2, penalties: 0,
      }))),
    });
  }

  const viewer = await prisma.user.findUnique({ where: { username: viewerName }, select: { id: true } });
  if (!viewer) throw new Error('Performance fixture is incomplete; run db:test:reset.');
  const counts = {
    users: await prisma.user.count(),
    profiles: await prisma.userProfile.count(),
    leaderboardRows: await prisma.userLeaderboardStats.count(),
    courses: await prisma.course.count(),
    tees: await prisma.tee.count(),
    holes: await prisma.hole.count(),
    friendLinks: await prisma.friend.count(),
    friendRequests: await prisma.friendRequest.count(),
    blocks: await prisma.userBlock.count(),
    realRounds: await prisma.round.count({ where: { userId: viewer.id, roundContext: 'real' } }),
    simulatorRounds: await prisma.round.count({ where: { userId: viewer.id, roundContext: 'simulator' } }),
    roundHoles: await prisma.roundHole.count(),
  };
  const expected = {
    users: 1 + PERF_SCALE.friendCandidates + PERF_SCALE.rankedUsers,
    profiles: 1 + PERF_SCALE.friendCandidates + PERF_SCALE.rankedUsers,
    leaderboardRows: 1 + PERF_SCALE.rankedUsers,
    courses: PERF_SCALE.courses,
    tees: PERF_SCALE.courses * PERF_SCALE.teesPerCourse,
    holes: PERF_SCALE.courses * PERF_SCALE.holesPerCourse,
    friendLinks: 5 + PERF_SCALE.rankedFriends,
    friendRequests: 10,
    blocks: 1,
    realRounds: PERF_SCALE.realRounds,
    simulatorRounds: PERF_SCALE.simulatorRounds,
    roundHoles: PERF_SCALE.realRounds * PERF_SCALE.roundHolesPerRealRound,
  };
  if (JSON.stringify(counts) !== JSON.stringify(expected)) {
    throw new Error('Performance fixture counts differ from the declared synthetic scale; run db:test:reset.');
  }
  return { viewerId: viewer.id, counts };
}
