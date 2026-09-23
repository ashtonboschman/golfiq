CREATE TYPE "LiveRoundSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCARDED');

CREATE TYPE "LiveRoundActiveStep" AS ENUM ('GPS', 'SCORE');

CREATE TABLE "live_round_sessions" (
  "id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "course_id" BIGINT NOT NULL,
  "tee_id" BIGINT NOT NULL,
  "final_round_id" BIGINT,
  "status" "LiveRoundSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "date" TIMESTAMPTZ(6) NOT NULL,
  "tee_segment" TEXT NOT NULL DEFAULT 'full',
  "round_context" "RoundContext" NOT NULL DEFAULT 'real',
  "notes" TEXT,
  "active_hole_number" INTEGER NOT NULL DEFAULT 1,
  "active_hole_pass" SMALLINT NOT NULL DEFAULT 1,
  "active_step" "LiveRoundActiveStep" NOT NULL DEFAULT 'SCORE',
  "live_round_track_fir" BOOLEAN NOT NULL DEFAULT true,
  "live_round_track_gir" BOOLEAN NOT NULL DEFAULT true,
  "live_round_track_chips" BOOLEAN NOT NULL DEFAULT true,
  "live_round_track_greenside_bunker_shots" BOOLEAN NOT NULL DEFAULT true,
  "live_round_track_putts" BOOLEAN NOT NULL DEFAULT true,
  "live_round_track_penalties" BOOLEAN NOT NULL DEFAULT true,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "discarded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "live_round_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "live_round_hole_drafts" (
  "id" BIGSERIAL NOT NULL,
  "session_id" BIGINT NOT NULL,
  "hole_id" BIGINT NOT NULL,
  "hole_number" INTEGER NOT NULL,
  "display_hole_number" INTEGER NOT NULL,
  "pass" SMALLINT NOT NULL DEFAULT 1,
  "score" INTEGER,
  "fir_hit" INTEGER,
  "fir_direction" "RoundMissDirection",
  "gir_hit" INTEGER,
  "gir_direction" "RoundMissDirection",
  "putts" INTEGER,
  "penalties" INTEGER,
  "chips" INTEGER,
  "greenside_bunker_shots" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "live_round_hole_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_round_sessions_final_round_id_key" ON "live_round_sessions"("final_round_id");
CREATE INDEX "idx_live_round_sessions_user_status_saved" ON "live_round_sessions"("user_id", "status", "last_saved_at");
CREATE INDEX "idx_live_round_sessions_user_status_updated" ON "live_round_sessions"("user_id", "status", "updated_at");
CREATE INDEX "idx_live_round_sessions_course_id" ON "live_round_sessions"("course_id");
CREATE INDEX "idx_live_round_sessions_tee_id" ON "live_round_sessions"("tee_id");
CREATE INDEX "idx_live_round_sessions_status" ON "live_round_sessions"("status");

CREATE UNIQUE INDEX "uq_live_round_hole_drafts_session_hole_pass" ON "live_round_hole_drafts"("session_id", "hole_id", "pass");
CREATE INDEX "idx_live_round_hole_drafts_session_id" ON "live_round_hole_drafts"("session_id");
CREATE INDEX "idx_live_round_hole_drafts_session_display" ON "live_round_hole_drafts"("session_id", "display_hole_number");
CREATE INDEX "idx_live_round_hole_drafts_hole_id" ON "live_round_hole_drafts"("hole_id");

ALTER TABLE "live_round_sessions"
  ADD CONSTRAINT "live_round_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_round_sessions"
  ADD CONSTRAINT "live_round_sessions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_round_sessions"
  ADD CONSTRAINT "live_round_sessions_tee_id_fkey"
  FOREIGN KEY ("tee_id") REFERENCES "tees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "live_round_sessions"
  ADD CONSTRAINT "live_round_sessions_final_round_id_fkey"
  FOREIGN KEY ("final_round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "live_round_hole_drafts"
  ADD CONSTRAINT "live_round_hole_drafts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "live_round_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_round_hole_drafts"
  ADD CONSTRAINT "live_round_hole_drafts_hole_id_fkey"
  FOREIGN KEY ("hole_id") REFERENCES "holes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
