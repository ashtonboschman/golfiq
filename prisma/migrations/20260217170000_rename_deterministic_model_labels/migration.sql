UPDATE "round_insights"
SET "model_used" = 'post-round-deterministic-v1'
WHERE "model_used" = 'deterministic-v1';

UPDATE "overall_insights"
SET "model_used" = 'overall-deterministic-v1'
WHERE "model_used" IN ('deterministic-v2', 'deterministic-v1');

ALTER TABLE "round_insights"
  ALTER COLUMN "model_used" SET DEFAULT 'post-round-deterministic-v1';

ALTER TABLE "overall_insights"
  ALTER COLUMN "model_used" SET DEFAULT 'overall-deterministic-v1';
