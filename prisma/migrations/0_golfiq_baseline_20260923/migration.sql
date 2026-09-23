-- Generated from the current Prisma schema with Prisma 7.10 migrate diff.
-- Physical-fidelity edits against the read-only production catalog:
--   * Nine BIGSERIAL ids became PostgreSQL IDENTITY columns (one ALWAYS,
--     eight BY DEFAULT), preserving the production sequence behavior.
--   * Four standalone unique indexes became ordinary UNIQUE constraints,
--     which create their identically named backing indexes.
--   * SubscriptionProvider uses production enum order via schema.prisma.
--   * The user_clubs check, explicit RLS, and portable role ACLs below are
--     current non-Prisma application/security structure.
-- Supabase platform objects and historical data transformations are excluded.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('free', 'premium', 'lifetime');

-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('stripe', 'apple', 'manual', 'revenuecat_web');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unspecified');

-- CreateEnum
CREATE TYPE "DefaultTee" AS ENUM ('blue', 'white', 'red', 'gold', 'black');

-- CreateEnum
CREATE TYPE "DashboardVisibility" AS ENUM ('private', 'friends', 'public');

-- CreateEnum
CREATE TYPE "TeeGender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('bug', 'idea', 'other');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'in_review', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "ClubCategory" AS ENUM ('WOOD', 'HYBRID', 'UTILITY_IRON', 'IRON', 'NAMED_WEDGE', 'LOFTED_WEDGE');

-- CreateEnum
CREATE TYPE "CourseRequestStatus" AS ENUM ('pending', 'added', 'rejected');

-- CreateEnum
CREATE TYPE "CourseRequestSource" AS ENUM ('local_search', 'global_api_no_result', 'manual');

-- CreateEnum
CREATE TYPE "RoundContext" AS ENUM ('real', 'simulator', 'practice', 'scramble');

-- CreateEnum
CREATE TYPE "RoundMissDirection" AS ENUM ('hit', 'miss_left', 'miss_right', 'miss_short', 'miss_long');

-- CreateEnum
CREATE TYPE "LiveRoundSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "LiveRoundActiveStep" AS ENUM ('GPS', 'SCORE');

-- CreateEnum
CREATE TYPE "UserReportReason" AS ENUM ('inappropriate_profile_or_avatar', 'harassment_or_abuse', 'spam_or_fake_account', 'other');

-- CreateEnum
CREATE TYPE "UserReportStatus" AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "FriendNotificationType" AS ENUM ('friend_request_accepted');

-- CreateEnum
CREATE TYPE "GpsMappingStatus" AS ENUM ('DRAFT', 'READY', 'VERIFIED', 'DISABLED');

-- CreateEnum
CREATE TYPE "GpsCourseRequestStatus" AS ENUM ('REQUESTED', 'MAPPED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "GpsMappingSource" AS ENUM ('MANUAL_ADMIN_GOOGLE', 'ON_COURSE_VERIFIED', 'IMPORTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "sessions_valid_after" TIMESTAMPTZ(6),
    "subscription_provider" "SubscriptionProvider",
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "apple_original_transaction_id" VARCHAR(255),
    "apple_product_id" VARCHAR(255),
    "subscription_ends_at" TIMESTAMPTZ(6),
    "subscription_starts_at" TIMESTAMPTZ(6),
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "subscription_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'free',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" BIGSERIAL NOT NULL,
    "reporter_id" BIGINT NOT NULL,
    "reported_user_id" BIGINT NOT NULL,
    "reason" "UserReportReason" NOT NULL,
    "details" TEXT,
    "status" "UserReportStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" BIGSERIAL NOT NULL,
    "blocker_id" BIGINT NOT NULL,
    "blocked_user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "refresh_token_encrypted" TEXT,
    "refresh_token_client_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "theme" VARCHAR(50) NOT NULL DEFAULT 'dark',
    "timezone" VARCHAR(100),
    "show_strokes_gained" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_fir" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_gir" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_chips" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_greenside_bunker_shots" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_putts" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_penalties" BOOLEAN NOT NULL DEFAULT true,

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
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "average_to_par" DECIMAL(5,1),
    "best_to_par" DECIMAL(5,1),

    CONSTRAINT "user_leaderboard_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" BIGSERIAL NOT NULL,
    "club_name" VARCHAR(255) NOT NULL,
    "course_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_external_ids" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_id_migration_map" (
    "old_course_id" BIGINT NOT NULL,
    "new_course_id" BIGINT NOT NULL,
    "provider" TEXT,
    "current_external_id" TEXT,
    "migrated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_id_migration_map_pkey" PRIMARY KEY ("old_course_id")
);

-- CreateTable
CREATE TABLE "course_update_audits" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "external_course_id" VARCHAR(255) NOT NULL,
    "admin_user_id" BIGINT NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "local_snapshot_hash" VARCHAR(64) NOT NULL,
    "provider_snapshot_hash" VARCHAR(64) NOT NULL,
    "changes" JSONB NOT NULL,
    "created_tee_ids" JSONB NOT NULL,
    "provider_descriptors" JSONB NOT NULL,
    "correlation_id" VARCHAR(64),

    CONSTRAINT "course_update_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "gps_course_requests" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "status" "GpsCourseRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gps_course_requests_pkey" PRIMARY KEY ("id")
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "non_par3_holes" INTEGER NOT NULL,

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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "holes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "tee_id" BIGINT NOT NULL,
    "hole_by_hole" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "score" INTEGER NOT NULL,
    "net_score" INTEGER,
    "fir_hit" INTEGER,
    "gir_hit" INTEGER,
    "putts" INTEGER,
    "penalties" INTEGER,
    "chips" INTEGER,
    "greenside_bunker_shots" INTEGER,
    "short_game_shots" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "to_par" SMALLINT,
    "net_to_par" SMALLINT,
    "handicap_at_round" DECIMAL(4,1),
    "tee_segment" TEXT NOT NULL DEFAULT 'full',
    "holes_played" INTEGER NOT NULL DEFAULT 18,
    "round_context" "RoundContext" NOT NULL DEFAULT 'real',
    "duration_seconds" INTEGER,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_holes" (
    "id" BIGSERIAL NOT NULL,
    "round_id" BIGINT NOT NULL,
    "hole_id" BIGINT NOT NULL,
    "pass" SMALLINT NOT NULL DEFAULT 1,
    "score" INTEGER NOT NULL,
    "fir_hit" INTEGER,
    "fir_direction" "RoundMissDirection",
    "gir_hit" INTEGER,
    "gir_direction" "RoundMissDirection",
    "putts" INTEGER,
    "penalties" INTEGER,
    "chips" INTEGER,
    "greenside_bunker_shots" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "round_holes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_round_sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "tee_id" BIGINT NOT NULL,
    "final_round_id" BIGINT,
    "status" "LiveRoundSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "date" TIMESTAMPTZ(6) NOT NULL,
    "tee_segment" TEXT NOT NULL DEFAULT 'full',
    "round_context" "RoundContext" NOT NULL DEFAULT 'real',
    "notes" TEXT,
    "start_hole_number" INTEGER NOT NULL DEFAULT 1,
    "active_hole_number" INTEGER NOT NULL DEFAULT 1,
    "active_hole_pass" SMALLINT NOT NULL DEFAULT 1,
    "active_step" "LiveRoundActiveStep" NOT NULL DEFAULT 'SCORE',
    "gps_enabled" BOOLEAN NOT NULL DEFAULT false,
    "live_round_track_fir" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_gir" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_chips" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_greenside_bunker_shots" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_putts" BOOLEAN NOT NULL DEFAULT true,
    "live_round_track_penalties" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timer_started_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "elapsed_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "discarded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_round_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_round_hole_drafts" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "hole_id" BIGINT NOT NULL,
    "hole_number" INTEGER NOT NULL,
    "display_hole_number" INTEGER NOT NULL,
    "pass" SMALLINT NOT NULL DEFAULT 1,
    "score" INTEGER,
    "fir_hit" INTEGER,
    "fir_direction" "RoundMissDirection",
    "gir_hit" INTEGER,
    "gir_direction" "RoundMissDirection",
    "putts" INTEGER,
    "penalties" INTEGER,
    "chips" INTEGER,
    "greenside_bunker_shots" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_round_hole_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" BIGSERIAL NOT NULL,
    "requester_id" BIGINT NOT NULL,
    "recipient_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friends" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "friend_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_notifications" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "actor_user_id" BIGINT NOT NULL,
    "type" "FriendNotificationType" NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "old_tier" VARCHAR(20),
    "new_tier" VARCHAR(20),
    "old_status" VARCHAR(20),
    "new_status" VARCHAR(20),
    "stripe_event_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenuecat_webhook_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "app_user_id" VARCHAR(255),
    "product_id" VARCHAR(255),
    "store" VARCHAR(64),
    "environment" VARCHAR(32),
    "processed_at" TIMESTAMPTZ(6),
    "raw_event" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenuecat_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifetime_grants" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "granted_by" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifetime_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_exports" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "record_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "club_definitions" (
    "id" BIGSERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "short_label" VARCHAR(12) NOT NULL,
    "category" "ClubCategory" NOT NULL,
    "catalogue_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_clubs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "club_definition_id" BIGINT NOT NULL,
    "carry_yards" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" BIGSERIAL NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "user_id" BIGINT,
    "ip_address" VARCHAR(45),
    "provider" VARCHAR(50),
    "search_query" VARCHAR(255),
    "used_location" BOOLEAN NOT NULL DEFAULT false,
    "result_count" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_rate_limit_buckets" (
    "key" VARCHAR(100) NOT NULL,
    "count" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "flag_name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("flag_name")
);

-- CreateTable
CREATE TABLE "round_strokes_gained" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "round_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "sg_total" DECIMAL(5,1),
    "sg_off_tee" DECIMAL(5,1),
    "sg_approach" DECIMAL(5,1),
    "sg_short_game" DECIMAL(5,1),
    "sg_residual" DECIMAL(5,1),
    "sg_putting" DECIMAL(5,1),
    "sg_penalties" DECIMAL(5,1),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messages" JSONB,
    "partial_analysis" BOOLEAN,

    CONSTRAINT "round_strokes_gained_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handicap_tier_baseline" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "handicap" INTEGER NOT NULL,
    "baseline_score" DECIMAL(5,1) NOT NULL,
    "baseline_gir_pct" DECIMAL(5,1) NOT NULL,
    "baseline_fir_pct" DECIMAL(5,1) NOT NULL,
    "baseline_putts" DECIMAL(5,1) NOT NULL,
    "baseline_penalties" DECIMAL(5,1) NOT NULL,
    "baseline_short_game_shots" DECIMAL(5,1) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handicap_tier_baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_insights" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "round_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "model_used" TEXT NOT NULL DEFAULT 'post-round-deterministic-v1',
    "insights" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "round_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overall_insights" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "model_used" TEXT NOT NULL DEFAULT 'overall-deterministic-v1',
    "insights" JSONB NOT NULL,
    "data_hash" VARCHAR(64),
    "variant_offset" INTEGER NOT NULL DEFAULT 0,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_manual_refresh_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "overall_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_tiers" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "achievement_id" BIGINT NOT NULL,
    "tier_id" BIGINT NOT NULL,
    "threshold" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiers" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "name" "Tier" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievement_events" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "user_id" BIGINT NOT NULL,
    "achievement_id" BIGINT NOT NULL,
    "tier_id" BIGINT NOT NULL,
    "round_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievement_progress" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "user_id" BIGINT NOT NULL,
    "hole_in_one_count" SMALLINT,
    "albatross_count" SMALLINT,
    "eagle_count" SMALLINT,
    "perfect_round_count" SMALLINT,
    "penalty_free_round_count" SMALLINT,
    "putt_master_count" SMALLINT,
    "rounds_played_count" SMALLINT,
    "courses_played_count" SMALLINT,
    "best_score" SMALLINT,
    "under_par_count" SMALLINT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievement_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "user_id" BIGINT NOT NULL,
    "achievement_id" BIGINT NOT NULL,
    "tier_id" BIGINT NOT NULL,
    "unlocked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_subscription" ON "users"("subscription_tier", "subscription_status");

-- CreateIndex
CREATE INDEX "idx_users_stripe_customer" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "idx_user_reports_reporter" ON "user_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "idx_user_reports_reported" ON "user_reports"("reported_user_id");

-- CreateIndex
CREATE INDEX "idx_user_reports_status" ON "user_reports"("status");

-- CreateIndex
CREATE INDEX "idx_user_reports_created_at" ON "user_reports"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_reports_reporter_reported_status" ON "user_reports"("reporter_id", "reported_user_id", "status");

-- CreateIndex
CREATE INDEX "idx_user_blocks_blocker" ON "user_blocks"("blocker_id");

-- CreateIndex
CREATE INDEX "idx_user_blocks_blocked" ON "user_blocks"("blocked_user_id");

-- CreateIndex
CREATE INDEX "idx_user_blocks_created_at" ON "user_blocks"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_blocks_blocker_blocked" ON "user_blocks"("blocker_id", "blocked_user_id");

-- CreateIndex
CREATE INDEX "idx_oauth_accounts_user_id" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE INDEX "idx_oauth_accounts_email" ON "oauth_accounts"("email");

-- CreateIndex
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_provider_provider_account_key" UNIQUE ("provider", "provider_account_id");

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
CREATE INDEX "idx_average_to_par" ON "user_leaderboard_stats"("average_to_par");

-- CreateIndex
CREATE INDEX "idx_total_rounds" ON "user_leaderboard_stats"("total_rounds");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_password_reset_email" ON "password_reset_tokens"("email");

-- CreateIndex
CREATE INDEX "idx_password_reset_token" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_password_reset_expires" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_email_verification_email" ON "email_verification_tokens"("email");

-- CreateIndex
CREATE INDEX "idx_email_verification_token" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_email_verification_expires" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_course_verified" ON "courses"("verified");

-- CreateIndex
CREATE INDEX "idx_course_external_ids_course_provider" ON "course_external_ids"("course_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "uq_course_external_ids_provider_external_id" ON "course_external_ids"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_id_migration_map_new_course_id_key" ON "course_id_migration_map"("new_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_update_audits_correlation_id_key" ON "course_update_audits"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_course_update_audits_course_applied" ON "course_update_audits"("course_id", "applied_at");

-- CreateIndex
CREATE INDEX "idx_course_update_audits_admin_applied" ON "course_update_audits"("admin_user_id", "applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "mapped_courses_course_id_key" ON "mapped_courses"("course_id");

-- CreateIndex
CREATE INDEX "idx_mapped_courses_status" ON "mapped_courses"("mapping_status");

-- CreateIndex
CREATE INDEX "idx_mapped_courses_source" ON "mapped_courses"("source");

-- CreateIndex
CREATE INDEX "idx_mapped_holes_mapped_course_id" ON "mapped_holes"("mapped_course_id");

-- CreateIndex
CREATE INDEX "idx_mapped_holes_course_status" ON "mapped_holes"("mapped_course_id", "mapping_status");

-- CreateIndex
CREATE INDEX "idx_mapped_holes_status" ON "mapped_holes"("mapping_status");

-- CreateIndex
CREATE INDEX "idx_mapped_holes_source" ON "mapped_holes"("source");

-- CreateIndex
CREATE UNIQUE INDEX "uq_mapped_holes_course_hole" ON "mapped_holes"("mapped_course_id", "hole_number");

-- CreateIndex
CREATE INDEX "idx_gps_course_requests_course" ON "gps_course_requests"("course_id");

-- CreateIndex
CREATE INDEX "idx_gps_course_requests_user" ON "gps_course_requests"("user_id");

-- CreateIndex
CREATE INDEX "idx_gps_course_requests_status" ON "gps_course_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_gps_course_requests_course_user" ON "gps_course_requests"("course_id", "user_id");

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
CREATE INDEX "idx_round_user_context" ON "rounds"("user_id", "round_context");

-- CreateIndex
CREATE INDEX "idx_round_course_id" ON "rounds"("course_id");

-- CreateIndex
CREATE INDEX "idx_round_tee_id" ON "rounds"("tee_id");

-- CreateIndex
CREATE INDEX "idx_round_id" ON "round_holes"("round_id");

-- CreateIndex
CREATE INDEX "idx_hole_id" ON "round_holes"("hole_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_holes_round_id_hole_id_pass_key" ON "round_holes"("round_id", "hole_id", "pass");

-- CreateIndex
CREATE UNIQUE INDEX "live_round_sessions_final_round_id_key" ON "live_round_sessions"("final_round_id");

-- CreateIndex
CREATE INDEX "idx_live_round_sessions_user_status_saved" ON "live_round_sessions"("user_id", "status", "last_saved_at");

-- CreateIndex
CREATE INDEX "idx_live_round_sessions_user_status_updated" ON "live_round_sessions"("user_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "idx_live_round_sessions_course_id" ON "live_round_sessions"("course_id");

-- CreateIndex
CREATE INDEX "idx_live_round_sessions_tee_id" ON "live_round_sessions"("tee_id");

-- CreateIndex
CREATE INDEX "idx_live_round_sessions_status" ON "live_round_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_live_round_hole_drafts_session_id" ON "live_round_hole_drafts"("session_id");

-- CreateIndex
CREATE INDEX "idx_live_round_hole_drafts_session_display" ON "live_round_hole_drafts"("session_id", "display_hole_number");

-- CreateIndex
CREATE INDEX "idx_live_round_hole_drafts_hole_id" ON "live_round_hole_drafts"("hole_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_live_round_hole_drafts_session_hole_pass" ON "live_round_hole_drafts"("session_id", "hole_id", "pass");

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

-- CreateIndex
CREATE INDEX "idx_friend_notifications_user_read_created" ON "friend_notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "idx_friend_notifications_actor" ON "friend_notifications"("actor_user_id");

-- CreateIndex
CREATE INDEX "idx_subscription_events_user" ON "subscription_events"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscription_events_type" ON "subscription_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_subscription_events_date" ON "subscription_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "revenuecat_webhook_events_event_id_key" ON "revenuecat_webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "idx_rc_webhook_events_type" ON "revenuecat_webhook_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_rc_webhook_events_app_user" ON "revenuecat_webhook_events"("app_user_id");

-- CreateIndex
CREATE INDEX "idx_rc_webhook_events_created" ON "revenuecat_webhook_events"("created_at");

-- CreateIndex
CREATE INDEX "idx_lifetime_grants_user" ON "lifetime_grants"("user_id");

-- CreateIndex
CREATE INDEX "idx_data_exports_user" ON "data_exports"("user_id");

-- CreateIndex
CREATE INDEX "idx_data_exports_date" ON "data_exports"("created_at");

-- CreateIndex
CREATE INDEX "idx_user_feedback_user" ON "user_feedback"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_feedback_type" ON "user_feedback"("type");

-- CreateIndex
CREATE INDEX "idx_user_feedback_status" ON "user_feedback"("status");

-- CreateIndex
CREATE INDEX "idx_user_feedback_created_at" ON "user_feedback"("created_at");

-- CreateIndex
CREATE INDEX "idx_user_feedback_user_created_at" ON "user_feedback"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "club_definitions_key_key" ON "club_definitions"("key");

-- CreateIndex
CREATE INDEX "idx_club_definitions_category_order" ON "club_definitions"("category", "catalogue_order");

-- CreateIndex
CREATE INDEX "idx_club_definitions_active_order" ON "club_definitions"("is_active", "catalogue_order");

-- CreateIndex
CREATE INDEX "idx_user_clubs_user" ON "user_clubs"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_clubs_definition" ON "user_clubs"("club_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_clubs_user_definition" ON "user_clubs"("user_id", "club_definition_id");

-- CreateIndex
CREATE INDEX "idx_course_requests_user" ON "course_requests"("user_id");

-- CreateIndex
CREATE INDEX "idx_course_requests_status" ON "course_requests"("status");

-- CreateIndex
CREATE INDEX "idx_course_requests_source" ON "course_requests"("source");

-- CreateIndex
CREATE INDEX "idx_course_requests_created_at" ON "course_requests"("created_at");

-- CreateIndex
CREATE INDEX "idx_api_usage_endpoint_date" ON "api_usage_logs"("endpoint", "created_at");

-- CreateIndex
CREATE INDEX "idx_api_usage_user_date" ON "api_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_security_rate_limit_buckets_reset_at" ON "security_rate_limit_buckets"("reset_at");

-- CreateIndex
CREATE UNIQUE INDEX "round_strokes_gained_round_id_key" ON "round_strokes_gained"("round_id");

-- CreateIndex
CREATE INDEX "idx_round_strokes_gained_round" ON "round_strokes_gained"("round_id");

-- CreateIndex
CREATE INDEX "idx_round_strokes_gained_user" ON "round_strokes_gained"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_insights_round_id_key" ON "round_insights"("round_id");

-- CreateIndex
CREATE INDEX "idx_round_insights_round" ON "round_insights"("round_id");

-- CreateIndex
CREATE INDEX "idx_round_insights_user" ON "round_insights"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "overall_insights_user_id_key" ON "overall_insights"("user_id");

-- CreateIndex
CREATE INDEX "idx_overall_insights_user" ON "overall_insights"("user_id");

-- CreateIndex
CREATE INDEX "idx_overall_insights_generated" ON "overall_insights"("generated_at");

-- CreateIndex
ALTER TABLE "achievement_tiers" ADD CONSTRAINT "achievement_tiers_unique_achievement_tier" UNIQUE ("achievement_id", "tier_id");

-- CreateIndex
CREATE INDEX "idx_user_achievement_events_round" ON "user_achievement_events"("round_id");

-- CreateIndex
CREATE INDEX "idx_user_achievement_events_user_achievement" ON "user_achievement_events"("user_id", "achievement_id");

-- CreateIndex
ALTER TABLE "user_achievement_progress" ADD CONSTRAINT "user_achievement_progress_user_id_key" UNIQUE ("user_id");

-- CreateIndex
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_unique_user_achievement" UNIQUE ("user_id", "achievement_id");

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "fk_user_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "fk_user_reports_reported" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "fk_user_blocks_blocker" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "fk_user_blocks_blocked" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_favorite_course_id_fkey" FOREIGN KEY ("favorite_course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_leaderboard_stats" ADD CONSTRAINT "user_leaderboard_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_external_ids" ADD CONSTRAINT "course_external_ids_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_update_audits" ADD CONSTRAINT "course_update_audits_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_update_audits" ADD CONSTRAINT "course_update_audits_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapped_courses" ADD CONSTRAINT "mapped_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapped_holes" ADD CONSTRAINT "mapped_holes_mapped_course_id_fkey" FOREIGN KEY ("mapped_course_id") REFERENCES "mapped_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_course_requests" ADD CONSTRAINT "gps_course_requests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_course_requests" ADD CONSTRAINT "gps_course_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tees" ADD CONSTRAINT "tees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holes" ADD CONSTRAINT "holes_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_holes" ADD CONSTRAINT "round_holes_hole_id_fkey" FOREIGN KEY ("hole_id") REFERENCES "holes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_holes" ADD CONSTRAINT "round_holes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_round_sessions" ADD CONSTRAINT "live_round_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_round_sessions" ADD CONSTRAINT "live_round_sessions_final_round_id_fkey" FOREIGN KEY ("final_round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_round_sessions" ADD CONSTRAINT "live_round_sessions_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_round_sessions" ADD CONSTRAINT "live_round_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_round_hole_drafts" ADD CONSTRAINT "live_round_hole_drafts_hole_id_fkey" FOREIGN KEY ("hole_id") REFERENCES "holes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_round_hole_drafts" ADD CONSTRAINT "live_round_hole_drafts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_round_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_notifications" ADD CONSTRAINT "fk_friend_notifications_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_notifications" ADD CONSTRAINT "fk_friend_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifetime_grants" ADD CONSTRAINT "lifetime_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clubs" ADD CONSTRAINT "user_clubs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clubs" ADD CONSTRAINT "user_clubs_club_definition_id_fkey" FOREIGN KEY ("club_definition_id") REFERENCES "club_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_strokes_gained" ADD CONSTRAINT "round_strokes_gained_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_strokes_gained" ADD CONSTRAINT "round_strokes_gained_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_insights" ADD CONSTRAINT "round_insights_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_insights" ADD CONSTRAINT "round_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_insights" ADD CONSTRAINT "overall_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_tiers" ADD CONSTRAINT "achievement_tiers_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "achievement_tiers" ADD CONSTRAINT "achievement_tiers_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tiers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievement_events" ADD CONSTRAINT "user_achievement_events_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievement_events" ADD CONSTRAINT "user_achievement_events_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievement_events" ADD CONSTRAINT "user_achievement_events_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tiers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievement_events" ADD CONSTRAINT "user_achievement_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievement_progress" ADD CONSTRAINT "user_achievement_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tiers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Current application-owned constraint not representable in Prisma schema.
ALTER TABLE public.user_clubs ADD CONSTRAINT user_clubs_carry_yards_check CHECK (carry_yards BETWEEN 1 AND 399);

-- Match production RLS without a Supabase event trigger.
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."achievement_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."api_usage_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."club_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."course_external_ids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."course_id_migration_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."course_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."course_update_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."data_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."friend_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."friend_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."friends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gps_course_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."handicap_tier_baseline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."holes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lifetime_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."live_round_hole_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."live_round_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mapped_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mapped_holes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."oauth_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."overall_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."revenuecat_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."round_holes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."round_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."round_strokes_gained" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."security_rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_achievement_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_achievement_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_clubs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_leaderboard_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;

-- GolfIQ uses server-side database access; no client-role table or sequence access.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;

-- Supabase roles are optional in portable PostgreSQL. Preserve the production
-- client-role revocations and service-role access where those roles exist.
DO $golfiq_roles$
DECLARE
  client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', client_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', client_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', client_role);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
  END IF;
END
$golfiq_roles$;
