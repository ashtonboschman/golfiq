CREATE TYPE "GpsMappingStatus" AS ENUM ('DRAFT', 'READY', 'VERIFIED', 'DISABLED');

CREATE TYPE "GpsMappingSource" AS ENUM ('MANUAL_ADMIN_GOOGLE', 'ON_COURSE_VERIFIED', 'IMPORTED', 'UNKNOWN');

CREATE TABLE "mapped_courses" (
  "id" BIGSERIAL NOT NULL,
  "course_id" BIGINT NOT NULL,
  "bounds_north" DECIMAL(10,7),
  "bounds_south" DECIMAL(10,7),
  "bounds_east" DECIMAL(10,7),
  "bounds_west" DECIMAL(10,7),
  "min_zoom" DECIMAL(5,2),
  "max_zoom" DECIMAL(5,2),
  "mapping_status" "GpsMappingStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "GpsMappingSource" NOT NULL DEFAULT 'UNKNOWN',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mapped_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mapped_holes" (
  "id" BIGSERIAL NOT NULL,
  "mapped_course_id" BIGINT NOT NULL,
  "hole_number" INTEGER NOT NULL,
  "tee_lat" DECIMAL(10,7),
  "tee_lng" DECIMAL(10,7),
  "target1_lat" DECIMAL(10,7),
  "target1_lng" DECIMAL(10,7),
  "target1_label" VARCHAR(100),
  "target2_lat" DECIMAL(10,7),
  "target2_lng" DECIMAL(10,7),
  "target2_label" VARCHAR(100),
  "green_front_lat" DECIMAL(10,7),
  "green_front_lng" DECIMAL(10,7),
  "green_center_lat" DECIMAL(10,7),
  "green_center_lng" DECIMAL(10,7),
  "green_back_lat" DECIMAL(10,7),
  "green_back_lng" DECIMAL(10,7),
  "mapping_status" "GpsMappingStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "GpsMappingSource" NOT NULL DEFAULT 'UNKNOWN',
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mapped_holes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mapped_courses_course_id_key" ON "mapped_courses"("course_id");
CREATE INDEX "idx_mapped_courses_status" ON "mapped_courses"("mapping_status");
CREATE INDEX "idx_mapped_courses_source" ON "mapped_courses"("source");

CREATE UNIQUE INDEX "uq_mapped_holes_course_hole" ON "mapped_holes"("mapped_course_id", "hole_number");
CREATE INDEX "idx_mapped_holes_mapped_course_id" ON "mapped_holes"("mapped_course_id");
CREATE INDEX "idx_mapped_holes_course_status" ON "mapped_holes"("mapped_course_id", "mapping_status");
CREATE INDEX "idx_mapped_holes_status" ON "mapped_holes"("mapping_status");
CREATE INDEX "idx_mapped_holes_source" ON "mapped_holes"("source");

ALTER TABLE "mapped_courses"
  ADD CONSTRAINT "mapped_courses_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mapped_holes"
  ADD CONSTRAINT "mapped_holes_mapped_course_id_fkey"
  FOREIGN KEY ("mapped_course_id") REFERENCES "mapped_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
