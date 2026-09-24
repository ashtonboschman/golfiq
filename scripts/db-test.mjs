import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertLocalTestDatabaseUrl } = require('./db-test-safety.js');

function fail(message) {
  console.error(`[db:test] ${message}`);
  process.exit(1);
}

const action = process.argv[2];
if (!['up', 'down', 'reset', 'test'].includes(action)) fail('Expected up, down, reset, or test.');

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

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(args) {
  run('docker', ['compose', '-f', 'compose.db-test.yml', '--project-name', 'golfiq-db-test', ...args]);
}

function prisma(args) {
  run(process.execPath, ['node_modules/prisma/build/index.js', ...args]);
}

function jest(args) {
  run(process.execPath, ['node_modules/jest/bin/jest.js', ...args]);
}

if (action === 'up') compose(['up', '-d', '--wait']);
if (action === 'down') compose(['down']);
if (action === 'reset') {
  compose(['down', '--volumes']);
  compose(['up', '-d', '--wait']);
  prisma(['migrate', 'deploy']);
  prisma(['migrate', 'status']);
}
if (action === 'test') {
  prisma(['migrate', 'status']);
  jest(['--config', 'jest.db.config.js', '--ci', '--runInBand']);
}
