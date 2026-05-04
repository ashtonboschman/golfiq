CREATE TYPE "CourseRequestStatus" AS ENUM ('pending', 'added', 'rejected');

CREATE TYPE "CourseRequestSource" AS ENUM ('local_search', 'global_api_no_result', 'manual');

CREATE TABLE "course_requests" (
  "id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "query" VARCHAR(255),
  "course_name" VARCHAR(255) NOT NULL,
  "city" VARCHAR(100),
  "province" VARCHAR(100),
  "country" VARCHAR(100),
  "status" "CourseRequestStatus" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "source" "CourseRequestSource" NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "course_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_course_requests_user" ON "course_requests"("user_id");
CREATE INDEX "idx_course_requests_status" ON "course_requests"("status");
CREATE INDEX "idx_course_requests_source" ON "course_requests"("source");
CREATE INDEX "idx_course_requests_created_at" ON "course_requests"("created_at");

ALTER TABLE "course_requests"
  ADD CONSTRAINT "course_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
