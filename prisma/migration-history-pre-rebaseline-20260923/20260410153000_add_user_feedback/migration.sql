CREATE TYPE "FeedbackType" AS ENUM ('bug', 'idea', 'other');

CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'in_review', 'resolved', 'closed');

CREATE TABLE "user_feedback" (
  "id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "type" "FeedbackType" NOT NULL DEFAULT 'other',
  "message" TEXT NOT NULL,
  "page" VARCHAR(255),
  "app_version" VARCHAR(64),
  "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_user_feedback_user" ON "user_feedback"("user_id");
CREATE INDEX "idx_user_feedback_type" ON "user_feedback"("type");
CREATE INDEX "idx_user_feedback_status" ON "user_feedback"("status");
CREATE INDEX "idx_user_feedback_created_at" ON "user_feedback"("created_at");
CREATE INDEX "idx_user_feedback_user_created_at" ON "user_feedback"("user_id", "created_at");

ALTER TABLE "user_feedback"
  ADD CONSTRAINT "user_feedback_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
