import { POST } from '@/app/api/rounds/route';
import { PUT } from '@/app/api/rounds/[id]/route';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

jest.mock('@/lib/api-auth', () => ({
  ...jest.requireActual('@/lib/api-auth'),
  requireAuth: jest.fn(),
}));
jest.mock('@/lib/analytics/server', () => ({ captureServerEvent: jest.fn() }));
jest.mock('@/app/api/rounds/[id]/insights/route', () => ({ generateInsights: jest.fn() }));
jest.mock('@/app/api/insights/overall/route', () => ({ generateAndStoreOverallInsights: jest.fn() }));

const fixtureEmail = 'phase25-round-rollback@golfiq.test';
const fixtureCourse = 'Phase25 Rollback Fixture';
const baselineName = '0_golfiq_baseline_20260923';
const baselineChecksum = createHash('sha256')
  .update(readFileSync(resolve(process.cwd(), 'prisma/migrations', baselineName, 'migration.sql')))
  .digest('hex');
const mockedRequireAuth = requireAuth as jest.Mock;

type Fixture = { userId: bigint; courseId: bigint; teeId: bigint; holeIds: bigint[] };

async function removeFailureTriggers() {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS phase25_fail_stats_update ON public.user_leaderboard_stats');
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS phase25_fail_insight_delete ON public.round_insights');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.phase25_fail_stats_update()');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.phase25_fail_insight_delete()');
}

async function cleanFixtures() {
  await removeFailureTriggers();
  await prisma.user.deleteMany({ where: { email: fixtureEmail } });
  await prisma.course.deleteMany({ where: { courseName: fixtureCourse } });
  await prisma.handicapTierBaseline.deleteMany({ where: { handicap: -7 } });
}

async function seedFixture(): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { username: 'phase25_rollback', email: fixtureEmail, passwordHash: 'local-test-only' },
  });
  const course = await prisma.course.create({
    data: { clubName: 'Local Test Club', courseName: fixtureCourse },
  });
  const tee = await prisma.tee.create({
    data: {
      courseId: course.id,
      gender: 'male',
      teeName: 'Test Nine',
      numberOfHoles: 9,
      parTotal: 36,
      nonPar3Holes: 9,
      courseRating: 36,
      slopeRating: 113,
    },
  });
  const holes = await Promise.all(Array.from({ length: 9 }, (_, index) =>
    prisma.hole.create({
      data: { teeId: tee.id, holeNumber: index + 1, par: 4, yardage: 350 },
    })));
  await prisma.handicapTierBaseline.create({
    data: {
      handicap: -7,
      baselineScore: 72,
      baselineGIRPct: 55,
      baselineFIRPct: 60,
      baselinePutts: 32,
      baselinePenalties: 2,
      baselineShortGameShots: 8,
    },
  });
  await prisma.userLeaderboardStats.create({
    data: { userId: user.id, handicap: -7, averageScore: 42, bestScore: 42, totalRounds: 0 },
  });
  mockedRequireAuth.mockResolvedValue(user.id);
  return { userId: user.id, courseId: course.id, teeId: tee.id, holeIds: holes.map((hole) => hole.id) };
}

function holePayload(holeIds: bigint[], score: number) {
  return holeIds.map((holeId) => ({
    hole_id: holeId.toString(),
    pass: 1,
    score,
    fir_hit: 1,
    gir_hit: 1,
    putts: 2,
    penalties: 0,
  }));
}

function request(path: string, body: object) {
  return new Request(`http://127.0.0.1${path}`, {
    method: path === '/api/rounds' ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function roundGraph(userId: bigint, roundId: bigint) {
  return {
    round: await prisma.round.findUnique({ where: { id: roundId } }),
    holes: await prisma.roundHole.findMany({ where: { roundId }, orderBy: { holeId: 'asc' } }),
    strokesGained: await prisma.roundStrokesGained.findUnique({ where: { roundId } }),
    leaderboard: await prisma.userLeaderboardStats.findUnique({ where: { userId } }),
    insight: await prisma.roundInsight.findUnique({ where: { roundId } }),
  };
}

describe('physical PostgreSQL rollback of after-round transactions', () => {
  let fixture: Fixture;
  let expectedErrors: jest.SpyInstance;

  beforeAll(async () => {
    const identity = await prisma.$queryRaw<Array<{ database: string; db_user: string; port: number }>>`
      SELECT current_database() AS database, current_user AS db_user, inet_server_port() AS port
    `;
    expect(identity).toEqual([{ database: 'golfiq_test', db_user: 'golfiq_test', port: 5432 }]);
    const records = await prisma.$queryRaw<Array<{ checksum: string }>>`
      SELECT checksum FROM public._prisma_migrations WHERE migration_name = ${baselineName}
    `;
    expect(records).toEqual([{ checksum: baselineChecksum }]);
  });

  beforeEach(async () => {
    await cleanFixtures();
    fixture = await seedFixture();
    expectedErrors = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    expectedErrors?.mockRestore();
    await cleanFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    const pool = (globalThis as typeof globalThis & { pool?: { end: () => Promise<void> } }).pool;
    await pool?.end();
  });

  test('CREATE rolls back round, nine holes, SG, and leaderboard when a late DB write fails', async () => {
    const originalLeaderboard = await prisma.userLeaderboardStats.findUnique({ where: { userId: fixture.userId } });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION public.phase25_fail_stats_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM public.rounds r
          WHERE r.user_id = NEW.user_id AND r.notes = 'create-attempt'
            AND (SELECT count(*) FROM public.round_holes h WHERE h.round_id = r.id) = 9
            AND EXISTS (SELECT 1 FROM public.round_strokes_gained sg WHERE sg.round_id = r.id)
        ) THEN
          RAISE EXCEPTION 'phase25_create_prior_writes_missing';
        END IF;
        RAISE EXCEPTION 'phase25_create_after_graph';
      END; $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER phase25_fail_stats_update BEFORE UPDATE ON public.user_leaderboard_stats
      FOR EACH ROW EXECUTE FUNCTION public.phase25_fail_stats_update()
    `);

    const response = await POST(request('/api/rounds', {
      course_id: fixture.courseId.toString(),
      tee_id: fixture.teeId.toString(),
      date: '2026-09-20',
      tee_segment: 'full',
      round_context: 'real',
      hole_by_hole: true,
      round_holes: holePayload(fixture.holeIds, 4),
      notes: 'create-attempt',
    }) as any);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Database error', type: 'error' });
    expect(expectedErrors.mock.calls.flat().join(' ')).toContain('phase25_create_after_graph');
    expect(await prisma.round.count({ where: { userId: fixture.userId } })).toBe(0);
    expect(await prisma.roundHole.count({ where: { round: { userId: fixture.userId } } })).toBe(0);
    expect(await prisma.roundStrokesGained.count({ where: { userId: fixture.userId } })).toBe(0);
    expect(await prisma.roundInsight.count({ where: { userId: fixture.userId } })).toBe(0);
    expect(await prisma.userLeaderboardStats.findUnique({ where: { userId: fixture.userId } })).toEqual(originalLeaderboard);
    expect(await prisma.hole.count({ where: { teeId: fixture.teeId } })).toBe(9);
    expect(await prisma.course.count({ where: { id: fixture.courseId } })).toBe(1);
    expect(await prisma.user.count({ where: { id: fixture.userId } })).toBe(1);
  });

  test('EDIT restores the exact completed graph after hole replacement and a late insight delete fails', async () => {
    const original = await prisma.round.create({
      data: {
        userId: fixture.userId,
        courseId: fixture.courseId,
        teeId: fixture.teeId,
        date: new Date('2026-09-18T12:00:00.000Z'),
        score: 36,
        toPar: 0,
        holeByHole: true,
        holesPlayed: 9,
        teeSegment: 'full',
        roundContext: 'real',
        notes: 'original-round',
        handicapAtRound: -7,
      },
    });
    await prisma.roundHole.createMany({
      data: fixture.holeIds.map((holeId) => ({ roundId: original.id, holeId, score: 4, putts: 2, firHit: 1, girHit: 1 })),
    });
    await prisma.roundStrokesGained.create({
      data: { roundId: original.id, userId: fixture.userId, sgTotal: 1.2, messages: ['original SG'], partialAnalysis: false },
    });
    await prisma.roundInsight.create({
      data: { roundId: original.id, userId: fixture.userId, insights: { original: true } },
    });
    const before = await roundGraph(fixture.userId, original.id);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION public.phase25_fail_insight_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM public.rounds r
          WHERE r.id = OLD.round_id AND r.notes = 'edited-attempt' AND r.score = 45
            AND (SELECT count(*) FROM public.round_holes h WHERE h.round_id = r.id AND h.score = 5) = 9
            AND EXISTS (SELECT 1 FROM public.round_strokes_gained sg WHERE sg.round_id = r.id AND sg.sg_total IS DISTINCT FROM 1.2)
            AND EXISTS (SELECT 1 FROM public.user_leaderboard_stats s WHERE s.user_id = OLD.user_id AND s.total_rounds = 1)
        ) THEN
          RAISE EXCEPTION 'phase25_edit_prior_writes_missing';
        END IF;
        RAISE EXCEPTION 'phase25_edit_after_replacement';
      END; $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER phase25_fail_insight_delete BEFORE DELETE ON public.round_insights
      FOR EACH ROW EXECUTE FUNCTION public.phase25_fail_insight_delete()
    `);

    const response = await PUT(request(`/api/rounds/${original.id}`, {
      course_id: fixture.courseId.toString(),
      tee_id: fixture.teeId.toString(),
      date: '2026-09-19',
      score: 45,
      tee_segment: 'full',
      round_context: 'real',
      hole_by_hole: true,
      round_holes: holePayload(fixture.holeIds, 5),
      notes: 'edited-attempt',
    }) as any, { params: Promise.resolve({ id: original.id.toString() }) });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Database error', type: 'error' });
    expect(expectedErrors.mock.calls.flat().join(' ')).toContain('phase25_edit_after_replacement');
    expect(await roundGraph(fixture.userId, original.id)).toEqual(before);
    expect(await prisma.round.count({ where: { userId: fixture.userId } })).toBe(1);
    expect(await prisma.roundHole.count({ where: { roundId: original.id } })).toBe(9);
  });
});
