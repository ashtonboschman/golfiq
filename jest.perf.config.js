const base = require('./jest.config');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: ['<rootDir>/tests/perf/**/*.perf.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: ['<rootDir>/tests/db/safety.setup.js'],
  maxWorkers: 1,
};
