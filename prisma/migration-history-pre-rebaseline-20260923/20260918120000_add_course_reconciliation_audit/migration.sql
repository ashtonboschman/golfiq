-- Append-only history for admin-applied course scorecard reconciliation.
-- This migration intentionally does not alter tee identity or repair existing data.
CREATE TABLE "course_reconciliation_audits" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "external_course_id" VARCHAR(255) NOT NULL,
    "admin_user_id" BIGINT NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "local_snapshot_hash" VARCHAR(64) NOT NULL,
    "provider_snapshot_hash" VARCHAR(64) NOT NULL,
    "changes" JSONB NOT NULL,
    "created_tee_ids" JSONB NOT NULL,
    "provider_descriptors" JSONB NOT NULL,
    "correlation_id" VARCHAR(64),

    CONSTRAINT "course_reconciliation_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_reconciliation_audits_correlation_id_key"
ON "course_reconciliation_audits"("correlation_id");

CREATE INDEX "idx_course_reconciliation_audits_course_applied"
ON "course_reconciliation_audits"("course_id", "applied_at");

CREATE INDEX "idx_course_reconciliation_audits_admin_applied"
ON "course_reconciliation_audits"("admin_user_id", "applied_at");

ALTER TABLE "course_reconciliation_audits"
ADD CONSTRAINT "course_reconciliation_audits_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_reconciliation_audits"
ADD CONSTRAINT "course_reconciliation_audits_admin_user_id_fkey"
FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
