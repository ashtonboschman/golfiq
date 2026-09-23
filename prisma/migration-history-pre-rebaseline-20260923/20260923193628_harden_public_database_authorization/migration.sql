-- GolfIQ uses server-side Prisma, not direct anon/authenticated table access.
-- Prepared against the read-only production catalog audit of 2026-09-23.
-- public contained 47 postgres-owned application tables (including
-- _prisma_migrations), 43 postgres-owned sequences, and no views or foreign
-- tables. Recheck that inventory before separately authorizing production apply.
-- This forward-only migration must be carried into the eventual Prisma
-- rebaseline; the current historical chain cannot initialize from zero.
-- service_role, postgres, public schema USAGE, ensure_rls, and the
-- rls_auto_enable body are intentionally unchanged.

BEGIN;

-- ALL includes PostgreSQL 17 MAINTAIN, TRUNCATE, REFERENCES, and TRIGGER,
-- in addition to SELECT, INSERT, UPDATE, and DELETE.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- The only 28 production public policies are permissive ALL/TO PUBLIC with
-- USING (true) and WITH CHECK (true). Keep RLS enabled; do not replace them.
DROP POLICY "Enable all access for all users" ON public._prisma_migrations;
DROP POLICY "Enable all access for all users" ON public.achievement_tiers;
DROP POLICY "Enable all access for all users" ON public.achievements;
DROP POLICY "Enable all access for all users" ON public.api_usage_logs;
DROP POLICY "Enable all access for all users" ON public.courses;
DROP POLICY "Enable all access for all users" ON public.data_exports;
DROP POLICY "Enable all access for all users" ON public.email_verification_tokens;
DROP POLICY "Enable all access for all users" ON public.feature_flags;
DROP POLICY "Enable all access for all users" ON public.friend_requests;
DROP POLICY "Enable all access for all users" ON public.friends;
DROP POLICY "Enable all access for all users" ON public.handicap_tier_baseline;
DROP POLICY "Enable all access for all users" ON public.holes;
DROP POLICY "Enable all access for all users" ON public.lifetime_grants;
DROP POLICY "Enable all access for all users" ON public.locations;
DROP POLICY "Enable all access for all users" ON public.password_reset_tokens;
DROP POLICY "Enable all access for all users" ON public.round_holes;
DROP POLICY "Enable all access for all users" ON public.round_insights;
DROP POLICY "Enable all access for all users" ON public.round_strokes_gained;
DROP POLICY "Enable all access for all users" ON public.rounds;
DROP POLICY "Enable all access for all users" ON public.subscription_events;
DROP POLICY "Enable all access for all users" ON public.tees;
DROP POLICY "Enable all access for all users" ON public.tiers;
DROP POLICY "Enable all access for all users" ON public.user_achievement_events;
DROP POLICY "Enable all access for all users" ON public.user_achievement_progress;
DROP POLICY "Enable all access for all users" ON public.user_achievements;
DROP POLICY "Enable all access for all users" ON public.user_leaderboard_stats;
DROP POLICY "Enable all access for all users" ON public.user_profiles;
DROP POLICY "Enable all access for all users" ON public.users;

-- Current public functions are postgres-owned and not client-callable API.
-- Event-trigger invocation is independent of the direct EXECUTE grants below
-- (proved in the disposable PostgreSQL 17 fixture).
REVOKE EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_course_identity_migration()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;

-- These revoke the existing per-schema default ACL grants for objects later
-- created by postgres in public. Preserve service_role defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

-- FOLLOW-UP SECURITY HARDENING: PostgreSQL's global built-in default grants
-- PUBLIC EXECUTE on future functions. A public-schema-scoped REVOKE cannot
-- cancel it. Each future GolfIQ public function migration must explicitly
-- REVOKE EXECUTE from PUBLIC, anon, and authenticated unless client-callable.

COMMIT;
