import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { GET as coursesGet } from '@/app/api/courses/route';
import { GET as friendsGet } from '@/app/api/friends/search/route';
import { GET as leaderboardGet } from '@/app/api/leaderboard/route';
import { GET as dashboardGet } from '@/app/api/dashboard/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { ensurePerfFixture, PERF_SCALE } from './fixture';

jest.mock('@/lib/api-auth', () => ({
  ...jest.requireActual('@/lib/api-auth'),
  requireAuth: jest.fn(),
}));

jest.setTimeout(180_000);

type QueryRecord = {
  sql: string;
  values: unknown[];
  durationMs: number;
  rowsReturned: number | null;
};
type Sample = {
  status: number;
  resultCount: number;
  payloadBytes: number;
  wallMs: number;
  driverRoundTripMs: number;
  queries: QueryRecord[];
  responseShape: Record<string, unknown>;
  relationLoads?: Record<string, number>;
};

const originalQuery = pg.Client.prototype.query;
let activeQueries: QueryRecord[] | null = null;

function record(sql: string, values: unknown[], started: number, result: any) {
  activeQueries?.push({
    sql,
    values,
    durationMs: performance.now() - started,
    rowsReturned: typeof result?.rowCount === 'number' ? result.rowCount : null,
  });
}

function installQueryCapture() {
  (pg.Client.prototype as any).query = function (...args: any[]) {
    if (!activeQueries) return (originalQuery as any).apply(this, args);
    const config = args[0];
    const sql = typeof config === 'string' ? config : config?.text ?? '';
    const values = Array.isArray(args[1]) ? args[1] : Array.isArray(config?.values) ? config.values : [];
    const started = performance.now();
    const callbackIndex = args.findIndex((arg, index) => index > 0 && typeof arg === 'function');
    if (callbackIndex >= 0) {
      const callback = args[callbackIndex];
      args[callbackIndex] = (error: unknown, result: unknown) => {
        record(sql, values, started, result);
        callback(error, result);
      };
      return (originalQuery as any).apply(this, args);
    }
    const outcome = (originalQuery as any).apply(this, args);
    if (outcome && typeof outcome.then === 'function') {
      return outcome.then((result: unknown) => {
        record(sql, values, started, result);
        return result;
      }, (error: unknown) => {
        record(sql, values, started, null);
        throw error;
      });
    }
    return outcome;
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function queryPatterns(queries: QueryRecord[]) {
  const grouped = new Map<string, { sql: string; count: number; rowsReturned: number; totalMs: number }>();
  for (const query of queries) {
    const sql = query.sql.replace(/\s+/g, ' ').trim();
    const current = grouped.get(sql) ?? { sql, count: 0, rowsReturned: 0, totalMs: 0 };
    current.count += 1;
    current.rowsReturned += query.rowsReturned ?? 0;
    current.totalMs += query.durationMs;
    grouped.set(sql, current);
  }
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || b.totalMs - a.totalMs)
    .map((pattern) => ({
      statementSha256: createHash('sha256').update(pattern.sql).digest('hex').slice(0, 16),
      count: pattern.count,
      rowsReturned: pattern.rowsReturned,
      driverRoundTripMs: rounded(pattern.totalMs),
      sqlShape: pattern.sql.slice(0, 220),
    }));
}

function shape(id: string, body: any): { count: number; data: Record<string, unknown> } {
  if (id.startsWith('courses.')) {
    if (!Array.isArray(body.courses)) throw new Error(`${id}: missing courses`);
    let tees = 0;
    let holes = 0;
    for (const course of body.courses) {
      for (const gender of ['male', 'female']) {
        for (const tee of course.tees?.[gender] ?? []) {
          tees += 1;
          holes += tee.holes?.length ?? 0;
        }
      }
    }
    return { count: body.courses.length, data: { courses: body.courses.length, tees, holes } };
  }
  if (id.startsWith('friends.')) {
    if (!Array.isArray(body.results)) throw new Error(`${id}: missing results`);
    return {
      count: body.results.length,
      data: {
        results: body.results.length,
        statuses: body.results.reduce((counts: Record<string, number>, row: any) => {
          counts[row.status] = (counts[row.status] ?? 0) + 1;
          return counts;
        }, {}),
      },
    };
  }
  if (id.startsWith('leaderboard.')) {
    if (!Array.isArray(body.users)) throw new Error(`${id}: missing users`);
    return { count: body.users.length, data: { displayed: body.users.length, totalUsers: body.totalUsers } };
  }
  if (!Array.isArray(body.all_rounds)) throw new Error(`${id}: missing all_rounds`);
  return {
    count: body.all_rounds.length,
    data: { displayed: body.all_rounds.length, totalRoundsInDb: body.totalRoundsInDb, tier: body.isPremium ? 'premium' : 'free' },
  };
}

async function invoke(id: string, path: string, handler: (request: any) => Promise<Response>): Promise<Sample> {
  const request = new Request(`http://127.0.0.1${path}`);
  const queries: QueryRecord[] = [];
  let roundSpy: jest.SpyInstance | undefined;
  let holeSpy: jest.SpyInstance | undefined;
  if (id === 'dashboard.free') {
    roundSpy = jest.spyOn(prisma.round, 'findMany');
    holeSpy = jest.spyOn(prisma.roundHole, 'findMany');
  }
  activeQueries = queries;
  const started = performance.now();
  let response: Response;
  let bodyText: string;
  try {
    response = await handler(request as any);
    bodyText = await response.text();
  } finally {
    activeQueries = null;
  }
  const wallMs = performance.now() - started;
  const body = JSON.parse(bodyText);
  const result = shape(id, body);
  if (response.status !== 200) throw new Error(`${id}: HTTP ${response.status}, ${body?.message ?? 'unknown error'}`);
  let relationLoads: Record<string, number> | undefined;
  if (roundSpy && holeSpy) {
    const mainCall = roundSpy.mock.calls.findIndex((args) => Boolean(args[0]?.include?.tee?.include?.holes));
    const mainRows = mainCall >= 0 ? await roundSpy.mock.results[mainCall].value : [];
    const holeCall = holeSpy.mock.results[0];
    const selectedHoles = holeCall ? await holeCall.value : [];
    relationLoads = {
      mainRoundRows: mainRows.length,
      nestedTeeHoleObjects: mainRows.reduce((sum: number, row: any) => sum + (row.tee?.holes?.length ?? 0), 0),
      postCapRoundHoleRows: selectedHoles.length,
    };
    roundSpy.mockRestore();
    holeSpy.mockRestore();
  }
  return {
    status: response.status,
    resultCount: result.count,
    payloadBytes: Buffer.byteLength(bodyText, 'utf8'),
    wallMs,
    driverRoundTripMs: queries.reduce((sum, query) => sum + query.durationMs, 0),
    queries,
    responseShape: result.data,
    relationLoads,
  };
}

function summarizeScenario(id: string, path: string, samples: Sample[]) {
  const counts = [...new Set(samples.map((sample) => sample.queries.length))];
  const resultCounts = [...new Set(samples.map((sample) => sample.resultCount))];
  const queryShapes = samples.map((sample) => sample.queries.map((query) => query.sql).sort().join('\n'));
  const rowsReturned = samples.map((sample) => sample.queries.reduce((sum, query) => sum + (query.rowsReturned ?? 0), 0));
  const payloadSizes = samples.map((sample) => sample.payloadBytes);
  const responseShapes = samples.map((sample) => JSON.stringify(sample.responseShape));
  const relationLoads = samples.map((sample) => JSON.stringify(sample.relationLoads ?? null));
  if (counts.length !== 1 || resultCounts.length !== 1 || new Set(queryShapes).size !== 1
      || new Set(rowsReturned).size !== 1 || new Set(payloadSizes).size !== 1
      || new Set(responseShapes).size !== 1 || new Set(relationLoads).size !== 1) {
    throw new Error(`${id}: query shapes/counts, returned rows, result, payload, or relation loads varied between measured iterations`);
  }
  const first = samples[0];
  return {
    id,
    status: 'MEASURED',
    route: path,
    iterations: samples.length,
    resultCount: first.resultCount,
    queryCount: counts[0],
    rowsReturnedBySql: first.queries.reduce((sum, query) => sum + (query.rowsReturned ?? 0), 0),
    driverRoundTripMs: {
      median: rounded(median(samples.map((sample) => sample.driverRoundTripMs))),
      min: rounded(Math.min(...samples.map((sample) => sample.driverRoundTripMs))),
      max: rounded(Math.max(...samples.map((sample) => sample.driverRoundTripMs))),
    },
    requestWallMs: {
      median: rounded(median(samples.map((sample) => sample.wallMs))),
      min: rounded(Math.min(...samples.map((sample) => sample.wallMs))),
      max: rounded(Math.max(...samples.map((sample) => sample.wallMs))),
    },
    payloadBytes: first.payloadBytes,
    responseShape: first.responseShape,
    relationLoads: first.relationLoads ?? null,
    queryPatterns: queryPatterns(first.queries).slice(0, 8),
  };
}

function planNodes(node: any): Array<Record<string, unknown>> {
  return [{
    nodeType: node['Node Type'],
    relation: node['Relation Name'] ?? null,
    index: node['Index Name'] ?? null,
    estimatedRows: node['Plan Rows'],
    actualRows: node['Actual Rows'],
    loops: node['Actual Loops'],
    sortMethod: node['Sort Method'] ?? null,
    sharedHitBlocks: node['Shared Hit Blocks'] ?? null,
    sharedReadBlocks: node['Shared Read Blocks'] ?? null,
  }, ...(node.Plans ?? []).flatMap(planNodes)];
}

async function explainDominant(id: string, label: string, queries: QueryRecord[], match: (query: QueryRecord) => boolean) {
  const grouped = new Map<string, QueryRecord[]>();
  for (const query of queries) {
    if (!/^\s*(?:SELECT|WITH)\b/i.test(query.sql) || !match(query)) continue;
    const group = grouped.get(query.sql) ?? [];
    group.push(query);
    grouped.set(query.sql, group);
  }
  const dominant = [...grouped.values()].sort((a, b) => b.length - a.length)[0]?.[0];
  if (!dominant) throw new Error(`${id}/${label}: no read-only SQL query available for EXPLAIN`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${dominant.sql}`, dominant.values as any[]);
    await client.query('ROLLBACK');
    const plan = result.rows[0]['QUERY PLAN'][0];
    return {
      scenario: id,
      label,
      statementSha256: createHash('sha256').update(dominant.sql.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16),
      planningMs: rounded(plan['Planning Time']),
      executionMs: rounded(plan['Execution Time']),
      nodes: planNodes(plan.Plan).slice(0, 20),
    };
  } finally {
    await client.end();
  }
}

test('record real local PostgreSQL query baseline through current route handlers', async () => {
  const identity = await prisma.$queryRaw<Array<{ database: string; db_user: string; version: string }>>`
    SELECT current_database() AS database, current_user AS db_user, version() AS version
  `;
  expect(identity[0].database).toBe('golfiq_test');
  expect(identity[0].db_user).toBe('golfiq_test');
  expect(identity[0].version).toContain('PostgreSQL 17');
  const fixture = await ensurePerfFixture();
  (requireAuth as jest.Mock).mockResolvedValue(fixture.viewerId);
  installQueryCapture();

  const definitions = [
    { id: 'courses.list', path: '/api/courses?limit=20&page=1', handler: coursesGet },
    { id: 'courses.search', path: '/api/courses?limit=20&page=1&search=PerfCourse', handler: coursesGet },
    { id: 'courses.page2', path: '/api/courses?limit=20&page=2&search=PerfCourse', handler: coursesGet },
    { id: 'friends.small', path: '/api/friends/search?q=Small', handler: friendsGet },
    { id: 'friends.search', path: '/api/friends/search?q=PerfFriend', handler: friendsGet },
    { id: 'leaderboard.global', path: '/api/leaderboard?scope=global&limit=25&page=1&sortBy=handicap&sortOrder=asc', handler: leaderboardGet },
    { id: 'dashboard.free', path: '/api/dashboard?statsMode=combined&dateFilter=all', handler: dashboardGet },
  ];
  const scenarios = [];
  const firstQueries = new Map<string, QueryRecord[]>();
  try {
    for (const definition of definitions) {
      await invoke(definition.id, definition.path, definition.handler);
      await invoke(definition.id, definition.path, definition.handler);
      const samples = [];
      for (let iteration = 0; iteration < 5; iteration += 1) {
        samples.push(await invoke(definition.id, definition.path, definition.handler));
      }
      firstQueries.set(definition.id, samples[0].queries);
      scenarios.push(summarizeScenario(definition.id, definition.path, samples));
    }
  } finally {
    activeQueries = null;
    (pg.Client.prototype as any).query = originalQuery;
  }

  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const course = byId.get('courses.search')!;
  const friendSmall = byId.get('friends.small')!;
  const friendBroad = byId.get('friends.search')!;
  const leaderboard = byId.get('leaderboard.global')!;
  const dashboard = byId.get('dashboard.free')!;
  const courseQueries = firstQueries.get('courses.search')!;
  for (const id of ['courses.list', 'courses.search', 'courses.page2']) {
    const scenario = byId.get(id)!;
    expect(scenario.resultCount).toBe(20);
    expect(scenario.queryCount).toBe(4);
    expect(scenario.rowsReturnedBySql).toBe(620);
  }
  expect(course.payloadBytes).toBe(55_977);
  expect(courseQueries.filter((query) => query.sql.includes('FROM "public"."courses"'))).toHaveLength(1);
  expect(courseQueries.filter((query) => query.sql.includes('FROM "public"."locations"'))).toHaveLength(1);
  const duplicatedCourseBaseReads = courseQueries.filter((query) => query.sql.includes('FROM "public"."courses"')).length >= 2
    && courseQueries.filter((query) => query.sql.includes('FROM "public"."locations"'))
      .reduce((sum, query) => sum + (query.rowsReturned ?? 0), 0) >= course.resultCount * 2;
  const classifications = {
    courses: duplicatedCourseBaseReads ? 'CONFIRMED PROBLEM' : 'LIKELY NEEDS MEASUREMENT AT LARGER SCALE',
    friends: friendBroad.queryCount - friendSmall.queryCount >= 2 * (friendBroad.resultCount - friendSmall.resultCount)
      ? 'CONFIRMED PROBLEM' : 'LIKELY NEEDS MEASUREMENT AT LARGER SCALE',
    leaderboard: leaderboard.queryCount >= leaderboard.resultCount + 3
      ? 'CONFIRMED PROBLEM' : 'LIKELY NEEDS MEASUREMENT AT LARGER SCALE',
    dashboard: dashboard.relationLoads && dashboard.relationLoads.mainRoundRows > dashboard.resultCount
      ? 'CONFIRMED PROBLEM' : 'LIKELY NEEDS MEASUREMENT AT LARGER SCALE',
  };
  const planTargets = [
    { id: 'courses.search', label: 'course-page', match: (query: QueryRecord) => query.sql.includes('FROM "public"."courses"') },
    { id: 'courses.search', label: 'tee-holes', match: (query: QueryRecord) => query.sql.includes('FROM "public"."holes"') },
    { id: 'friends.search', label: 'per-result-friend-requests', match: (query: QueryRecord) => query.sql.includes('FROM "public"."friend_requests"') },
    { id: 'leaderboard.global', label: 'per-row-rank-count', match: (query: QueryRecord) => query.sql.includes('COUNT(*)') && query.sql.includes('user_leaderboard_stats') },
    { id: 'dashboard.free', label: 'pre-cap-rounds', match: (query: QueryRecord) => query.sql.includes('FROM "public"."rounds"') && query.rowsReturned === PERF_SCALE.realRounds },
  ];
  const plans = [];
  for (const target of planTargets) {
    plans.push(await explainDominant(target.id, target.label, firstQueries.get(target.id)!, target.match));
  }
  const packageLock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
  const artifact = {
    schemaVersion: 1,
    artifactType: 'local-postgres-query-baseline',
    generatedAt: new Date().toISOString(),
    git: { commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
    runtime: { node: process.version, prisma: packageLock.packages['node_modules/prisma'].version, postgres: identity[0].version.split(' on ')[0] },
    target: { databaseLabel: 'local-golfiq-test', hostClass: 'loopback', fixtureLabel: 'phase-0.5-synthetic-v1' },
    dataset: fixture.counts,
    methodology: {
      path: 'current GET route handlers with real Prisma/PostgreSQL; authentication boundary mocked',
      warmups: 2,
      measuredIterations: 5,
      requestWallMs: 'handler invocation through serialized Response body read; excludes HTTP transport',
      driverRoundTripMs: 'sum of node-postgres query round trips; not PostgreSQL server execution time',
      rowsReturnedBySql: 'sum of node-postgres rowCount; not rows scanned',
      payloadBytes: 'UTF-8 bytes of serialized response body',
      explain: 'local-only EXPLAIN ANALYZE BUFFERS on relevant read-only SQL shapes; single representative parameter set per shape',
      queryParametersRecorded: false,
    },
    classifications,
    scenarios,
    queryPlans: plans,
  };
  mkdirSync(resolve(process.cwd(), 'perf/results'), { recursive: true });
  const output = resolve(process.cwd(), 'perf/results', `snapshot-db-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
  writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
  console.log(`[perf:snapshot] Wrote ${output}`);
  expect(scenarios).toHaveLength(7);
});

afterAll(async () => {
  await prisma.$disconnect();
  const pool = (globalThis as typeof globalThis & { pool?: { end: () => Promise<void> } }).pool;
  await pool?.end();
});
