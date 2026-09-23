-- Terminal sessions without a completed round no longer support resume or idempotent finalization.
-- Deleting the session also cascades deletion to its live hole drafts.
DELETE FROM "live_round_sessions"
WHERE "status" = 'DISCARDED'
   OR ("status" = 'COMPLETED' AND "final_round_id" IS NULL);

-- Completed rounds keep their lightweight session metadata for finalization idempotency
-- and GPS adoption reporting. RoundHole is authoritative after finalization, so drafts are redundant.
DELETE FROM "live_round_hole_drafts" AS drafts
USING "live_round_sessions" AS sessions
WHERE drafts."session_id" = sessions."id"
  AND sessions."status" = 'COMPLETED';
