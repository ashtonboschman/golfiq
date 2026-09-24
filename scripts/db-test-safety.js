const EXPECTED = Object.freeze({
  host: '127.0.0.1',
  port: '5434',
  database: 'golfiq_test',
  user: 'golfiq_test',
  password: 'golfiq_test_only',
});

function assertLocalTestDatabaseUrl(raw) {
  if (!raw) throw new Error('GOLFIQ_TEST_DATABASE_URL is required; production DATABASE_URL is never a fallback.');

  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new Error('GOLFIQ_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  const valid = target.protocol === 'postgresql:'
    && target.hostname === EXPECTED.host
    && target.port === EXPECTED.port
    && target.pathname === `/${EXPECTED.database}`
    && decodeURIComponent(target.username) === EXPECTED.user
    && decodeURIComponent(target.password) === EXPECTED.password
    && target.searchParams.size === 1
    && target.searchParams.get('schema') === 'public'
    && !target.hash;

  if (!valid) {
    throw new Error('Database target rejected: expected the exact loopback GolfIQ test container identity.');
  }
  return target.toString();
}

function assertTestProcessEnvironment(env = process.env) {
  const target = assertLocalTestDatabaseUrl(env.GOLFIQ_TEST_DATABASE_URL);
  if (!env.DATABASE_URL || env.DATABASE_URL !== target) {
    throw new Error('DB tests require DATABASE_URL to equal the validated GOLFIQ_TEST_DATABASE_URL.');
  }
  return target;
}

module.exports = { assertLocalTestDatabaseUrl, assertTestProcessEnvironment };
