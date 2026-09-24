# Local PostgreSQL integration tests

Requires Node 24, Docker Desktop (or Docker Engine with Compose), and port 5434 free on loopback.
The committed `db-test.env` contains only fixed credentials for the isolated `golfiq_test` container.
No production environment file is needed.

```sh
npm run db:test:up       # start PostgreSQL 17 and wait for health
npm run db:test:reset    # delete only this Compose project's volume; migrate from zero
npm run test:db          # run the opt-in PostgreSQL-backed Jest tier
npm run db:test:down     # stop the container; retain its local volume
```

`db:test:reset` is destructive **only to the local test database**. The runner rejects a missing
test URL, non-loopback host, wrong port/database/user/password, unexpected URL options, and a
conflicting inherited `DATABASE_URL`. It explicitly supplies the validated local URL to Prisma
and Jest; neither command falls back to the application's `.env` URL. The DB test setup checks
the target again before importing application code. Regular `test:ci` and CI exclude these tests.

The rollback tests create only small, named fixtures and remove them after each test. Temporary
failure triggers are installed only in this disposable local database and removed before fixture
cleanup. Run `db:test:reset` if a test process is interrupted. The same database can later host
synthetic Phase 0.5 performance fixtures, but this phase does not populate them.
