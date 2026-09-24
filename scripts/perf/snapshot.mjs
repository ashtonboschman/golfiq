import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const resultsRoot = resolve(repoRoot, 'perf', 'results');
const safeLabelPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const require = createRequire(import.meta.url);
const { assertLocalTestDatabaseUrl } = require('../db-test-safety.js');

function fail(message) {
  console.error(`[perf:snapshot] ${message}`);
  process.exit(1);
}

if (process.argv[2] === '--local-db') {
  let target;
  try {
    target = assertLocalTestDatabaseUrl(process.env.GOLFIQ_TEST_DATABASE_URL);
    if (process.env.DATABASE_URL && process.env.DATABASE_URL !== target) {
      fail('An existing DATABASE_URL differs from the local test target; refusing to proceed.');
    }
  } catch (error) {
    fail(error.message);
  }
  const env = { ...process.env, DATABASE_URL: target };
  for (const name of [
    'DB_CA_CERT', 'DB_CA_CERT_PATH', 'PGHOST', 'PGPORT', 'PGDATABASE',
    'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGSSLROOTCERT',
  ]) delete env[name];
  const result = spawnSync(process.execPath, [
    'node_modules/jest/bin/jest.js', '--config', 'jest.perf.config.js', '--ci', '--runInBand',
  ], { cwd: repoRoot, env, stdio: 'inherit' });
  if (result.error) fail(`Local DB snapshot runner could not start: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function requireConfirmation(name) {
  if (requiredEnv(name) !== 'YES') fail(`${name} must be exactly YES.`);
}

function safeLabel(name) {
  const value = requiredEnv(name);
  if (!safeLabelPattern.test(value)) {
    fail(`${name} must be a non-sensitive label using only letters, numbers, dots, underscores, and hyphens.`);
  }
  return value;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function percentile(sorted, value) {
  const index = Math.max(0, Math.ceil((value / 100) * sorted.length) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rounded = (value) => Math.round(value * 1000) / 1000;
  return {
    min: rounded(sorted[0]),
    p50: rounded(percentile(sorted, 50)),
    p95: sorted.length >= 10 ? rounded(percentile(sorted, 95)) : null,
    max: rounded(sorted.at(-1)),
  };
}

function summarizeOptionalHeader(samples, headerName) {
  const values = samples.map((sample) => {
    const raw = sample.headers.get(headerName);
    if (raw === null || raw.trim() === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  });
  if (values.some((value) => value === null)) return null;
  return summarize(values);
}

function countStatuses(samples) {
  return Object.fromEntries(
    [...samples.reduce((counts, sample) => {
      counts.set(sample.status, (counts.get(sample.status) ?? 0) + 1);
      return counts;
    }, new Map()).entries()].sort(([a], [b]) => a - b),
  );
}

function readPackageVersions() {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf8'));
  return {
    next: lock.packages?.['node_modules/next']?.version ?? packageJson.dependencies?.next ?? null,
    prisma: lock.packages?.['node_modules/prisma']?.version ?? packageJson.devDependencies?.prisma ?? null,
  };
}

function resolveOutputPath(timestamp) {
  const requested = process.env.PERF_OUTPUT?.trim();
  const output = requested
    ? resolve(repoRoot, requested)
    : resolve(resultsRoot, `snapshot-${timestamp.replaceAll(':', '-').replaceAll('.', '-')}.json`);
  const outputRelative = relative(resultsRoot, output);
  if (isAbsolute(outputRelative) || outputRelative.startsWith('..') || !output.endsWith('.json')) {
    fail('PERF_OUTPUT must be a .json file inside perf/results/.');
  }
  return output;
}

function dashboardShape(body) {
  if (!Array.isArray(body?.all_rounds)) throw new Error('unexpected_response_shape');
  return {
    resultCount: body.all_rounds.length,
    totalRounds: Number.isFinite(body.total_rounds) ? body.total_rounds : null,
    totalRoundsInDatabase: Number.isFinite(body.totalRoundsInDb) ? body.totalRoundsInDb : null,
    tier: body.isPremium === true ? 'premium' : 'free',
    limitedToLast20: body.limitedToLast20 === true,
  };
}

function coursesShape(body) {
  if (!Array.isArray(body?.courses)) throw new Error('unexpected_response_shape');
  let teeCount = 0;
  let holeCount = 0;
  for (const course of body.courses) {
    for (const gender of ['male', 'female']) {
      const tees = Array.isArray(course?.tees?.[gender]) ? course.tees[gender] : [];
      teeCount += tees.length;
      for (const tee of tees) holeCount += Array.isArray(tee?.holes) ? tee.holes.length : 0;
    }
  }
  return { resultCount: body.courses.length, teeCount, holeCount };
}

function friendsShape(body) {
  if (!Array.isArray(body?.results)) throw new Error('unexpected_response_shape');
  const statusCounts = {};
  for (const result of body.results) {
    const status = typeof result?.status === 'string' ? result.status : 'unknown';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  return { resultCount: body.results.length, statusCounts };
}

function leaderboardShape(body) {
  if (!Array.isArray(body?.users)) throw new Error('unexpected_response_shape');
  return {
    resultCount: body.users.length,
    totalUsers: Number.isFinite(body.totalUsers) ? body.totalUsers : null,
    tier: body.isPremium === true ? 'premium' : 'free',
    showingLimited: body.showingLimited === true,
  };
}

const timestamp = new Date().toISOString();
requireConfirmation('PERF_CONFIRM_NON_PRODUCTION');
requireConfirmation('PERF_CONFIRM_SYNTHETIC_FIXTURE');
requireConfirmation('PERF_CONFIRM_NO_EXTERNAL_PROVIDERS');

let baseUrl;
try {
  baseUrl = new URL(requiredEnv('PERF_BASE_URL'));
} catch {
  fail('PERF_BASE_URL must be a valid URL.');
}
if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  fail('PERF_BASE_URL must be an HTTP(S) URL without embedded credentials.');
}
if (!loopbackHosts.has(baseUrl.hostname) && process.env.PERF_ALLOW_REMOTE?.trim() !== 'YES') {
  fail('Remote targets require PERF_ALLOW_REMOTE=YES.');
}

const databaseTargetLabel = safeLabel('PERF_DATABASE_LABEL');
if (/prod(?:uction)?|live/i.test(databaseTargetLabel)) {
  fail('PERF_DATABASE_LABEL must not identify a production/live database.');
}
if (!/^(?:local|dev(?:elopment)?|test|staging|perf(?:ormance)?|disposable)(?:[._-]|$)/i.test(databaseTargetLabel)) {
  fail('PERF_DATABASE_LABEL must begin with local, dev, development, test, staging, perf, performance, or disposable.');
}

const serverLabel = safeLabel('PERF_SERVER_LABEL');
if (/prod(?:uction)?|live/i.test(serverLabel)) {
  fail('PERF_SERVER_LABEL must not identify a production/live server.');
}
const fixtureLabel = safeLabel('PERF_FIXTURE_LABEL');
const serverMode = requiredEnv('PERF_SERVER_MODE');
if (!['production', 'development'].includes(serverMode)) {
  fail('PERF_SERVER_MODE must be production or development.');
}
const authTier = requiredEnv('PERF_AUTH_TIER');
if (!['free', 'premium'].includes(authTier)) fail('PERF_AUTH_TIER must be free or premium.');

const sessionCookie = requiredEnv('PERF_SESSION_COOKIE');
if (/[\r\n]/.test(sessionCookie)) fail('PERF_SESSION_COOKIE contains invalid newline characters.');
const courseQuery = requiredEnv('PERF_COURSE_QUERY');
const friendQuery = requiredEnv('PERF_FRIEND_QUERY');
const warmups = boundedInteger('PERF_WARMUPS', 2, 0, 10);
const iterations = boundedInteger('PERF_ITERATIONS', 10, 5, 25);
const timeoutMs = boundedInteger('PERF_TIMEOUT_MS', 30_000, 1_000, 120_000);
const outputPath = resolveOutputPath(timestamp);
const postgresVersion = process.env.PERF_POSTGRES_VERSION?.trim() || null;
if (postgresVersion && !/^[A-Za-z0-9 ._()-]{1,64}$/.test(postgresVersion)) {
  fail('PERF_POSTGRES_VERSION contains unsupported characters.');
}

const scenarios = [
  {
    id: `dashboard.${authTier}`,
    route: '/api/dashboard?statsMode=combined&dateFilter=all',
    requestPath: '/api/dashboard?statsMode=combined&dateFilter=all',
    shape: dashboardShape,
  },
  {
    id: 'courses.search',
    route: '/api/courses?limit=20&page=1&search=<synthetic-query>',
    requestPath: `/api/courses?limit=20&page=1&search=${encodeURIComponent(courseQuery)}`,
    shape: coursesShape,
  },
  {
    id: 'friends.search',
    route: '/api/friends/search?q=<synthetic-query>',
    requestPath: `/api/friends/search?q=${encodeURIComponent(friendQuery)}`,
    shape: friendsShape,
  },
  {
    id: 'leaderboard.global',
    route: '/api/leaderboard?scope=global&limit=25&page=1&sortBy=handicap&sortOrder=asc',
    requestPath: '/api/leaderboard?scope=global&limit=25&page=1&sortBy=handicap&sortOrder=asc',
    shape: leaderboardShape,
  },
];

async function requestScenario(scenario) {
  const started = performance.now();
  const response = await fetch(new URL(scenario.requestPath, baseUrl), {
    headers: {
      Accept: 'application/json',
      Cookie: sessionCookie,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const bodyText = await response.text();
  return {
    status: response.status,
    durationMs: performance.now() - started,
    payloadBytes: Buffer.byteLength(bodyText, 'utf8'),
    headers: response.headers,
    bodyText,
  };
}

async function measureScenario(scenario) {
  const warmupSamples = [];
  const measuredSamples = [];
  try {
    for (let index = 0; index < warmups; index += 1) {
      const sample = await requestScenario(scenario);
      warmupSamples.push(sample);
      if (sample.status < 200 || sample.status >= 300) throw new Error(`unexpected_http_status_${sample.status}`);
    }
    for (let index = 0; index < iterations; index += 1) {
      const sample = await requestScenario(scenario);
      measuredSamples.push(sample);
      if (sample.status < 200 || sample.status >= 300) throw new Error(`unexpected_http_status_${sample.status}`);
    }

    const shapes = measuredSamples.map((sample) => scenario.shape(JSON.parse(sample.bodyText)));
    const firstShape = JSON.stringify(shapes[0]);
    const queryCount = summarizeOptionalHeader(measuredSamples, 'x-golfiq-query-count');
    const dbDurationMs = summarizeOptionalHeader(measuredSamples, 'x-golfiq-db-duration-ms');
    const providerCallCount = summarizeOptionalHeader(measuredSamples, 'x-golfiq-provider-call-count');
    return {
      id: scenario.id,
      status: 'MEASURED',
      method: 'GET',
      route: scenario.route,
      warmups,
      iterations,
      initialRequestMs: warmupSamples.length > 0 ? Math.round(warmupSamples[0].durationMs * 1000) / 1000 : null,
      warmupDurationMs: summarize(warmupSamples.map((sample) => sample.durationMs)),
      requestDurationMs: summarize(measuredSamples.map((sample) => sample.durationMs)),
      payloadBytes: summarize(measuredSamples.map((sample) => sample.payloadBytes)),
      httpStatusCounts: countStatuses(measuredSamples),
      dataShape: shapes[0],
      dataShapeStable: shapes.every((shape) => JSON.stringify(shape) === firstShape),
      queryMetrics: {
        source: queryCount || dbDurationMs || providerCallCount ? 'response_headers' : null,
        queryCount,
        dbDurationMs,
        providerCallCount,
      },
    };
  } catch (error) {
    const observed = [...warmupSamples, ...measuredSamples];
    const message = error instanceof Error ? error.message : 'request_failed';
    return {
      id: scenario.id,
      status: 'NOT MEASURED',
      method: 'GET',
      route: scenario.route,
      reason: /^unexpected_http_status_\d+$/.test(message) ? message : 'request_failed_or_timed_out',
      observedHttpStatusCounts: observed.length > 0 ? countStatuses(observed) : {},
    };
  }
}

async function main() {
  const versions = readPackageVersions();
  const measuredScenarios = [];
  for (const scenario of scenarios) {
    console.log(`[perf:snapshot] Measuring ${scenario.id}...`);
    measuredScenarios.push(await measureScenario(scenario));
  }

  const artifact = {
    schemaVersion: 1,
    generatedAt: timestamp,
    git: {
      commitSha: git(['rev-parse', 'HEAD']),
      workingTreeClean: git(['status', '--porcelain'], '') === '',
    },
    runtime: {
      node: process.version,
      next: versions.next,
      prisma: versions.prisma,
      platform: platform(),
      release: release(),
      architecture: arch(),
      serverMode,
    },
    target: {
      serverLabel,
      databaseLabel: databaseTargetLabel,
      postgresVersion,
      fixtureLabel,
      authenticationTier: authTier,
    },
    methodology: {
      requestConcurrency: 1,
      warmups,
      iterations,
      timeoutMs,
      timingClock: 'performance.now',
      requestTimingBoundary: 'fetch start through complete response body read',
      payloadDefinition: 'UTF-8 byte length of the complete HTTP response body',
      queryMetricHeaders: ['x-golfiq-query-count', 'x-golfiq-db-duration-ms'],
      responseBodiesRecorded: false,
    },
    scenarios: [
      ...measuredScenarios,
      { id: 'round.create', status: 'BLOCKED', reason: 'disposable_mutation_fixture_not_implemented' },
      { id: 'round.edit', status: 'BLOCKED', reason: 'disposable_mutation_fixture_not_implemented' },
      { id: 'live.finalize', status: 'BLOCKED', reason: 'disposable_mutation_fixture_not_implemented' },
    ],
    queryPlans: {
      status: 'NOT CAPTURED',
      reason: 'snapshot_command_does_not_accept_database_credentials_or_execute_sql',
      plans: [],
    },
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
  console.log(`[perf:snapshot] Wrote ${relative(repoRoot, outputPath).replaceAll('\\', '/')}`);

  if (measuredScenarios.some((scenario) => scenario.status !== 'MEASURED')) {
    console.error('[perf:snapshot] One or more read scenarios were not measured successfully.');
    process.exit(1);
  }
}

main().catch(() => fail('Snapshot failed before a safe artifact could be completed.'));
