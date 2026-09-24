# Local PostgreSQL performance baseline

The Phase 0.5 read-path baseline is in `baselines/phase-0.5-static.json`; the earlier static audit remains under `priorStaticScenarios`. Raw local runs are written to ignored `results/` files.

Run from the repository root:

```text
npm run db:test:up
npm run db:test:reset
npm run perf:snapshot:db
npm run perf:snapshot:db
npm run db:test:down
```

`db:test:reset` destroys only the dedicated `golfiq_test` container volume and reapplies the tracked baseline migration. The perf fixture seeds an empty local database on the first run; later runs verify exact counts and reuse it. If the fixture is partial or contains other data, reset the dedicated local database. The snapshot command requires the exact Phase 2.5 loopback test URL and rejects a conflicting `DATABASE_URL`; it never falls back to an application URL. No production data or connection is used.

Each scenario calls the current GET handler with real Prisma/PostgreSQL and only the authentication boundary mocked. Two warmups precede five measured iterations. Query count and per-query round-trip time come from local `node-postgres` interception. Round-trip durations include client/driver overhead and may overlap under concurrent queries; their sum is **not** PostgreSQL server execution time and can exceed wall time. Wall time covers the handler call through response body read, not HTTP transport. SQL `rowCount` counts returned rows, not rows scanned. `EXPLAIN ANALYZE` is local, read-only, and represents a single parameter set per selected SQL shape, not aggregate request database time. Small-fixture sequential scans are observations, not standalone indexing recommendations.

The existing `npm run perf:snapshot` HTTP mode remains separate and still requires its explicit safety confirmations. This local DB mode is not run in ordinary Jest, CI, or `verify:fast`/`verify:full`.
