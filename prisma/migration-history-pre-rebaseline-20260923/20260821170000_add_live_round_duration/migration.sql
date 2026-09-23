ALTER TABLE "rounds"
ADD COLUMN "duration_seconds" INTEGER;

ALTER TABLE "live_round_sessions"
ADD COLUMN "timer_started_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "elapsed_seconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "live_round_sessions"
SET "timer_started_at" = NULL
WHERE "status" <> 'ACTIVE';
