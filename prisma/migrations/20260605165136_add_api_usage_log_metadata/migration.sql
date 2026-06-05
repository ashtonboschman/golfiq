ALTER TABLE "api_usage_logs"
  ADD COLUMN "provider" VARCHAR(50),
  ADD COLUMN "search_query" VARCHAR(255),
  ADD COLUMN "used_location" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "result_count" INTEGER,
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'success',
  ADD COLUMN "error_code" VARCHAR(100);
