-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unspecified');

-- CreateEnum
CREATE TYPE "DefaultTee" AS ENUM ('blue', 'white', 'red', 'gold', 'black');

-- CreateEnum
CREATE TYPE "DashboardVisibility" AS ENUM ('private', 'friends', 'public');

-- CreateEnum
CREATE TYPE "TeeGender" AS ENUM ('male', 'female');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "avatar_url" VARCHAR(255) NOT NULL DEFAULT '/avatars/default.png',
    "bio" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'unspecified',
    "default_tee" "DefaultTee" NOT NULL DEFAULT 'white',
    "favorite_course_id" BIGINT,
    "dashboard_visibility" "DashboardVisibility" NOT NULL DEFAULT 'friends',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_leaderboard_stats" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "handicap" DECIMAL(4,1),
    "average_score" DECIMAL(5,1),
    "best_score" SMALLINT,
    "total_rounds" INTEGER NOT NULL DEFAULT 0,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_leaderboard_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" BIGSERIAL NOT NULL,
    "club_name" VARCHAR(255) NOT NULL,
    "course_name" VARCHAR(255) NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "address" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "country" VARCHAR(50),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tees" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "gender" "TeeGender" NOT NULL,
    "tee_name" VARCHAR(100) NOT NULL,
    "course_rating" DECIMAL(5,2),
    "slope_rating" INTEGER,
    "bogey_rating" DECIMAL(5,2),
    "total_yards" INTEGER,
    "total_meters" INTEGER,
    "number_of_holes" INTEGER,
    "par_total" INTEGER,
    "front_course_rating" DECIMAL(5,2),
    "front_slope_rating" INTEGER,
    "front_bogey_rating" DECIMAL(5,2),
    "back_course_rating" DECIMAL(5,2),
    "back_slope_rating" INTEGER,
    "back_bogey_rating" DECIMAL(5,2),
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holes" (
    "id" BIGSERIAL NOT NULL,
    "tee_id" BIGINT NOT NULL,
    "hole_number" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "yardage" INTEGER NOT NULL,
    "handicap" INTEGER,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "tee_id" BIGINT NOT NULL,
    "hole_by_hole" BOOLEAN NOT NULL DEFAULT false,
    "advanced_stats" BOOLEAN NOT NULL DEFAULT false,
    "date" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "fir_hit" INTEGER,
    "gir_hit" INTEGER,
    "putts" INTEGER,
    "penalties" INTEGER,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_holes" (
    "id" BIGSERIAL NOT NULL,
    "round_id" BIGINT NOT NULL,
    "hole_id" BIGINT NOT NULL,
    "score" INTEGER NOT NULL,
    "fir_hit" INTEGER,
    "gir_hit" INTEGER,
    "putts" INTEGER,
    "penalties" INTEGER,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "round_holes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" BIGSERIAL NOT NULL,
    "requester_id" BIGINT NOT NULL,
    "recipient_id" BIGINT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friends" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "friend_id" BIGINT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_dashboard_visibility" ON "user_profiles"("dashboard_visibility");

-- CreateIndex
CREATE UNIQUE INDEX "user_leaderboard_stats_user_id_key" ON "user_leaderboard_stats"("user_id");

-- CreateIndex
CREATE INDEX "idx_handicap" ON "user_leaderboard_stats"("handicap");

-- CreateIndex
CREATE INDEX "idx_average_score" ON "user_leaderboard_stats"("average_score");

-- CreateIndex
CREATE INDEX "idx_total_rounds" ON "user_leaderboard_stats"("total_rounds");

-- CreateIndex
CREATE UNIQUE INDEX "locations_course_id_key" ON "locations"("course_id");

-- CreateIndex
CREATE INDEX "idx_location_course_id" ON "locations"("course_id");

-- CreateIndex
CREATE INDEX "idx_tee_course_id" ON "tees"("course_id");

-- CreateIndex
CREATE INDEX "idx_hole_tee_id" ON "holes"("tee_id");

-- CreateIndex
CREATE INDEX "idx_user_id" ON "rounds"("user_id");

-- CreateIndex
CREATE INDEX "idx_round_course_id" ON "rounds"("course_id");

-- CreateIndex
CREATE INDEX "idx_round_tee_id" ON "rounds"("tee_id");

-- CreateIndex
CREATE INDEX "idx_round_id" ON "round_holes"("round_id");

-- CreateIndex
CREATE INDEX "idx_hole_id" ON "round_holes"("hole_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_holes_round_id_hole_id_key" ON "round_holes"("round_id", "hole_id");

-- CreateIndex
CREATE INDEX "idx_friend_requests_requester" ON "friend_requests"("requester_id");

-- CreateIndex
CREATE INDEX "idx_friend_requests_recipient" ON "friend_requests"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "friend_requests_requester_id_recipient_id_key" ON "friend_requests"("requester_id", "recipient_id");

-- CreateIndex
CREATE INDEX "idx_friends_user" ON "friends"("user_id");

-- CreateIndex
CREATE INDEX "fk_friends_friend" ON "friends"("friend_id");

-- CreateIndex
CREATE UNIQUE INDEX "friends_user_id_friend_id_key" ON "friends"("user_id", "friend_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_favorite_course_id_fkey" FOREIGN KEY ("favorite_course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_leaderboard_stats" ADD CONSTRAINT "user_leaderboard_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tees" ADD CONSTRAINT "tees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holes" ADD CONSTRAINT "holes_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_holes" ADD CONSTRAINT "round_holes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_holes" ADD CONSTRAINT "round_holes_hole_id_fkey" FOREIGN KEY ("hole_id") REFERENCES "holes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
