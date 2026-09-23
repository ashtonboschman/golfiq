CREATE TYPE "UserReportReason" AS ENUM (
  'inappropriate_profile_or_avatar',
  'harassment_or_abuse',
  'spam_or_fake_account',
  'other'
);

CREATE TYPE "UserReportStatus" AS ENUM (
  'open',
  'in_review',
  'resolved',
  'dismissed'
);

CREATE TABLE "user_reports" (
  "id" BIGSERIAL PRIMARY KEY,
  "reporter_id" BIGINT NOT NULL,
  "reported_user_id" BIGINT NOT NULL,
  "reason" "UserReportReason" NOT NULL,
  "details" TEXT,
  "status" "UserReportStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_user_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_user_reports_reported" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_user_reports_reporter_reported_status"
  ON "user_reports"("reporter_id", "reported_user_id", "status");

CREATE INDEX "idx_user_reports_reporter"
  ON "user_reports"("reporter_id");

CREATE INDEX "idx_user_reports_reported"
  ON "user_reports"("reported_user_id");

CREATE INDEX "idx_user_reports_status"
  ON "user_reports"("status");

CREATE INDEX "idx_user_reports_created_at"
  ON "user_reports"("created_at");

CREATE TABLE "user_blocks" (
  "id" BIGSERIAL PRIMARY KEY,
  "blocker_id" BIGINT NOT NULL,
  "blocked_user_id" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_user_blocks_blocker" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_user_blocks_blocked" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_user_blocks_blocker_blocked"
  ON "user_blocks"("blocker_id", "blocked_user_id");

CREATE INDEX "idx_user_blocks_blocker"
  ON "user_blocks"("blocker_id");

CREATE INDEX "idx_user_blocks_blocked"
  ON "user_blocks"("blocked_user_id");

CREATE INDEX "idx_user_blocks_created_at"
  ON "user_blocks"("created_at");
