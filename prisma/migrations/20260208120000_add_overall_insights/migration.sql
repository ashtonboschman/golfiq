CREATE TABLE IF NOT EXISTS "overall_insights" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "model_used" VARCHAR(255) NOT NULL DEFAULT 'gpt-4o-mini',
  "insights" JSONB NOT NULL,
  "data_hash" VARCHAR(64),
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "last_manual_refresh_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6)
);

CREATE INDEX IF NOT EXISTS "idx_overall_insights_user" ON "overall_insights"("user_id");
CREATE INDEX IF NOT EXISTS "idx_overall_insights_generated" ON "overall_insights"("generated_at");
