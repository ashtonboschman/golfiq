CREATE TYPE "GpsCourseRequestStatus" AS ENUM ('REQUESTED', 'MAPPED', 'DISMISSED');

CREATE TABLE "gps_course_requests" (
  "id" BIGSERIAL NOT NULL,
  "course_id" BIGINT NOT NULL,
  "user_id" BIGINT NOT NULL,
  "status" "GpsCourseRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "gps_course_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_gps_course_requests_course_user"
  ON "gps_course_requests"("course_id", "user_id");
CREATE INDEX "idx_gps_course_requests_course"
  ON "gps_course_requests"("course_id");
CREATE INDEX "idx_gps_course_requests_user"
  ON "gps_course_requests"("user_id");
CREATE INDEX "idx_gps_course_requests_status"
  ON "gps_course_requests"("status");

ALTER TABLE "gps_course_requests"
  ADD CONSTRAINT "gps_course_requests_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gps_course_requests"
  ADD CONSTRAINT "gps_course_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
