ALTER TABLE "round_insights"
  ALTER COLUMN "model_used" SET DEFAULT 'deterministic-v1';

ALTER TABLE "overall_insights"
  ALTER COLUMN "model_used" SET DEFAULT 'deterministic-v2';
