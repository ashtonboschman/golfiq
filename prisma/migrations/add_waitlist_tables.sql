-- GolfIQ Landing Page & Beta Waitlist Tables
-- Add waitlist, allowed_emails, and feature_flags tables

-- Waitlist table
CREATE TABLE IF NOT EXISTS public.waitlist (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  handicap VARCHAR(50),
  signed_up_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(50) NOT NULL DEFAULT 'landing_page',
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmation_token VARCHAR(255) UNIQUE,
  metadata JSONB,
  CONSTRAINT waitlist_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_confirmed ON public.waitlist(confirmed);

-- Allowed emails table (beta access whitelist)
CREATE TABLE IF NOT EXISTS public.allowed_emails (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  added_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(255),
  notes TEXT,
  CONSTRAINT allowed_emails_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_allowed_emails_email ON public.allowed_emails(email);

-- Feature flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  flag_name VARCHAR(100) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

-- Insert default feature flags
INSERT INTO public.feature_flags (flag_name, enabled, description)
VALUES
  ('registration_open', false, 'Allow public registration (not just allowlist)'),
  ('landing_page_active', true, 'Show landing page at / instead of redirecting to dashboard')
ON CONFLICT (flag_name) DO NOTHING;

-- Grant permissions (Supabase RLS)
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Waitlist policies (public can insert and read)
CREATE POLICY "Public can insert to waitlist" ON public.waitlist
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can view waitlist" ON public.waitlist
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can update waitlist" ON public.waitlist
  FOR UPDATE
  USING (true);

-- Allowed emails policies (authenticated users can read, service role can modify)
CREATE POLICY "Authenticated can view allowed emails" ON public.allowed_emails
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert allowed emails" ON public.allowed_emails
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete allowed emails" ON public.allowed_emails
  FOR DELETE
  USING (true);

-- Feature flags policies (public read, service role write)
CREATE POLICY "Public can view feature flags" ON public.feature_flags
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can update feature flags" ON public.feature_flags
  FOR UPDATE
  USING (true);

-- Comments for documentation
COMMENT ON TABLE public.waitlist IS 'Email signups from landing page for beta access';
COMMENT ON TABLE public.allowed_emails IS 'Whitelist of emails permitted to register during closed beta';
COMMENT ON TABLE public.feature_flags IS 'Global feature toggles for gradual rollout';
COMMENT ON COLUMN public.waitlist.confirmation_token IS 'Unique token for email confirmation link';
COMMENT ON COLUMN public.waitlist.metadata IS 'Additional data (UTM params, user agent, IP, etc.)';
COMMENT ON COLUMN public.allowed_emails.added_by IS 'Email or user ID of admin who granted access';
