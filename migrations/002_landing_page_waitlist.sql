-- GolfIQ Landing Page & Beta Waitlist System
-- Migration: 002_landing_page_waitlist
-- Created: 2026-01-19
-- Purpose: Add waitlist, allowed_emails, and feature_flags tables for beta launch

-- ============================================================================
-- WAITLIST TABLE
-- ============================================================================
-- Stores email signups from landing page
CREATE TABLE IF NOT EXISTS waitlist (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  handicap VARCHAR(50),
  signed_up_at TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(50) DEFAULT 'landing_page',
  confirmed BOOLEAN DEFAULT FALSE,
  confirmation_token VARCHAR(255) UNIQUE,
  metadata JSONB,
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_confirmed ON waitlist(confirmed);
CREATE INDEX IF NOT EXISTS idx_waitlist_confirmation_token ON waitlist(confirmation_token);

-- ============================================================================
-- ALLOWED EMAILS TABLE
-- ============================================================================
-- Whitelist of emails allowed to register during closed beta
CREATE TABLE IF NOT EXISTS allowed_emails (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by VARCHAR(255),
  notes TEXT,
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Index for fast email lookups during registration
CREATE INDEX IF NOT EXISTS idx_allowed_emails_email ON allowed_emails(email);

-- ============================================================================
-- FEATURE FLAGS TABLE
-- ============================================================================
-- Global feature toggles for gradual rollout
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name VARCHAR(100) PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
);

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES
  ('registration_open', false, 'Allow public registration (not just allowlist)'),
  ('landing_page_active', true, 'Show landing page at / instead of redirecting to dashboard')
ON CONFLICT (flag_name) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Enable RLS on all tables
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Waitlist policies
CREATE POLICY "Public can insert to waitlist" ON waitlist
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Public can view their own waitlist entry" ON waitlist
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Admins can view all waitlist entries" ON waitlist
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can update waitlist entries" ON waitlist
  FOR UPDATE TO authenticated
  USING (true);

-- Allowed emails policies (admin only)
CREATE POLICY "Admins can view allowed emails" ON allowed_emails
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert allowed emails" ON allowed_emails
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can delete allowed emails" ON allowed_emails
  FOR DELETE TO authenticated
  USING (true);

-- Feature flags policies (read for all, write for admins)
CREATE POLICY "Public can view feature flags" ON feature_flags
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can update feature flags" ON feature_flags
  FOR UPDATE TO authenticated
  USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE waitlist IS 'Email signups from landing page for beta access';
COMMENT ON TABLE allowed_emails IS 'Whitelist of emails permitted to register during closed beta';
COMMENT ON TABLE feature_flags IS 'Global feature toggles for gradual rollout';
COMMENT ON COLUMN waitlist.confirmation_token IS 'Unique token for email confirmation link';
COMMENT ON COLUMN waitlist.metadata IS 'Additional data (UTM params, referrer, etc.)';
COMMENT ON COLUMN allowed_emails.added_by IS 'Email or user ID of admin who granted access';
