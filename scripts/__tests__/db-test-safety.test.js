const { assertLocalTestDatabaseUrl, assertTestProcessEnvironment } = require('../db-test-safety.js');

const local = 'postgresql://golfiq_test:golfiq_test_only@127.0.0.1:5434/golfiq_test?schema=public';

describe('local DB test target safety', () => {
  test('accepts only the repository test container identity', () => {
    expect(assertLocalTestDatabaseUrl(local)).toBe(local);
    expect(assertTestProcessEnvironment({
      GOLFIQ_TEST_DATABASE_URL: local,
      DATABASE_URL: local,
    })).toBe(local);
  });

  test.each([
    [undefined, 'missing test target'],
    ['postgresql://postgres:secret@aws-1.pooler.supabase.com:5432/postgres', 'Supabase pooler'],
    ['postgresql://postgres:secret@db.example.supabase.co:5432/postgres', 'Supabase direct'],
    [local.replace('127.0.0.1', 'db.example.com'), 'remote host'],
    [local.replace(':5434/', ':5432/'), 'wrong port'],
    [local.replace('/golfiq_test?', '/postgres?'), 'wrong database'],
    [local.replace('://golfiq_test:', '://postgres:'), 'wrong user'],
    [local.replace(':golfiq_test_only@', ':other@'), 'wrong password'],
    [local.replace('127.0.0.1', 'localhost'), 'non-canonical localhost'],
    [local.replace('schema=public', 'sslmode=verify-full'), 'unexpected query options'],
  ])('rejects %s (%s)', (target) => {
    expect(() => assertLocalTestDatabaseUrl(target)).toThrow();
  });

  test('never falls back to the normal DATABASE_URL', () => {
    expect(() => assertTestProcessEnvironment({ DATABASE_URL: local })).toThrow();
    expect(() => assertTestProcessEnvironment({
      GOLFIQ_TEST_DATABASE_URL: local,
      DATABASE_URL: 'postgresql://postgres:secret@aws-1.pooler.supabase.com:5432/postgres',
    })).toThrow();
  });
});
