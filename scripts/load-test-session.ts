import process from 'process';

type Endpoint = {
  name: string;
  path: string;
};

type Result = {
  endpoint: string;
  status: number;
  durationMs: number;
  error?: string;
};

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const sessionCookie = process.env.SESSION_COOKIE;
const concurrency = Number(process.env.CONCURRENCY ?? 8);
const requestsPerEndpoint = Number(process.env.REQUESTS_PER_ENDPOINT ?? 12);

const endpoints: Endpoint[] = [
  { name: 'profile', path: '/api/users/profile' },
  { name: 'subscription', path: '/api/users/subscription' },
  { name: 'friends', path: '/api/friends' },
  { name: 'friends-incoming', path: '/api/friends/incoming' },
  { name: 'friends-outgoing', path: '/api/friends/outgoing' },
  { name: 'dashboard', path: '/api/dashboard?statsMode=combined&user_id=1&dateFilter=all' },
  { name: 'bootstrap', path: '/api/bootstrap' },
];

if (!sessionCookie) {
  console.error('Missing SESSION_COOKIE.');
  console.error('Example: set SESSION_COOKIE=next-auth.session-token=... (or __Secure-next-auth.session-token=...)');
  process.exit(1);
}
const cookieHeader = sessionCookie;

if (!Number.isFinite(concurrency) || concurrency < 1) {
  console.error('CONCURRENCY must be a positive number.');
  process.exit(1);
}

if (!Number.isFinite(requestsPerEndpoint) || requestsPerEndpoint < 1) {
  console.error('REQUESTS_PER_ENDPOINT must be a positive number.');
  process.exit(1);
}

const jobs: Endpoint[] = [];
for (const endpoint of endpoints) {
  for (let i = 0; i < requestsPerEndpoint; i += 1) jobs.push(endpoint);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function runRequest(endpoint: Endpoint): Promise<Result> {
  const url = `${baseUrl}${endpoint.path}`;
  const started = Date.now();

  try {
    const isBootstrap = endpoint.path === '/api/bootstrap';
    const response = await fetch(url, {
      method: isBootstrap ? 'POST' : 'GET',
      headers: isBootstrap
        ? {
            Cookie: cookieHeader,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }
        : {
            Cookie: cookieHeader,
            Accept: 'application/json',
          },
      body: isBootstrap ? '{}' : undefined,
    });

    return {
      endpoint: endpoint.name,
      status: response.status,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      endpoint: endpoint.name,
      status: 0,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool(): Promise<Result[]> {
  const results: Result[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      const result = await runRequest(jobs[index]);
      results.push(result);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

function summarize(results: Result[]): void {
  const byEndpoint = new Map<string, Result[]>();
  for (const result of results) {
    const list = byEndpoint.get(result.endpoint) ?? [];
    list.push(result);
    byEndpoint.set(result.endpoint, list);
  }

  console.log('\nLoad Test Summary');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Total requests: ${results.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Requests per endpoint: ${requestsPerEndpoint}\n`);

  const all500s = results.filter((r) => r.status >= 500);
  const allNetworkErrors = results.filter((r) => r.status === 0);

  for (const [endpoint, list] of byEndpoint.entries()) {
    const durations = list.map((r) => r.durationMs).sort((a, b) => a - b);
    const statusCounts = new Map<number, number>();
    for (const item of list) statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);

    const statusText = Array.from(statusCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([status, count]) => `${status}:${count}`)
      .join(' ');

    console.log(
      `${endpoint.padEnd(18)} p50=${percentile(durations, 50)}ms p95=${percentile(durations, 95)}ms p99=${percentile(durations, 99)}ms status=[${statusText}]`,
    );
  }

  if (allNetworkErrors.length > 0) {
    console.log(`\nNetwork errors: ${allNetworkErrors.length}`);
    for (const err of allNetworkErrors.slice(0, 5)) {
      console.log(`- ${err.endpoint}: ${err.error}`);
    }
  }

  console.log(`\n5xx responses: ${all500s.length}`);
  if (all500s.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const results = await runPool();
  summarize(results);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
