-- Rename the course update audit table and its supporting database objects.
-- This preserves all existing audit rows and remains safe when applied after
-- the original append-only audit migration.
ALTER TABLE "course_reconciliation_audits"
RENAME TO "course_update_audits";

ALTER TABLE "course_update_audits"
RENAME CONSTRAINT "course_reconciliation_audits_pkey"
TO "course_update_audits_pkey";

ALTER TABLE "course_update_audits"
RENAME CONSTRAINT "course_reconciliation_audits_course_id_fkey"
TO "course_update_audits_course_id_fkey";

ALTER TABLE "course_update_audits"
RENAME CONSTRAINT "course_reconciliation_audits_admin_user_id_fkey"
TO "course_update_audits_admin_user_id_fkey";

ALTER INDEX "course_reconciliation_audits_correlation_id_key"
RENAME TO "course_update_audits_correlation_id_key";

ALTER INDEX "idx_course_reconciliation_audits_course_applied"
RENAME TO "idx_course_update_audits_course_applied";

ALTER INDEX "idx_course_reconciliation_audits_admin_applied"
RENAME TO "idx_course_update_audits_admin_applied";

ALTER SEQUENCE "course_reconciliation_audits_id_seq"
RENAME TO "course_update_audits_id_seq";
