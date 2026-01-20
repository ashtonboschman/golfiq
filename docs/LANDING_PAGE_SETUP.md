# GolfIQ Landing Page & Beta Waitlist Setup Guide

**Last Updated:** 2026-01-20

---

## Overview

This guide covers the complete setup of GolfIQ's landing page, beta waitlist system, and closed beta registration flow. The landing page serves as the entry point for new users, while existing authenticated users are automatically redirected to the dashboard.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Setup](#database-setup)
3. [Environment Variables](#environment-variables)
4. [Resend Email Setup](#resend-email-setup)
5. [Feature Flags](#feature-flags)
6. [User Flow](#user-flow)
7. [Admin Panel](#admin-panel)
8. [Testing](#testing)
9. [Going Live](#going-live)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Key Components

**Frontend:**
- `/` - Landing page (unauthenticated users only)
- `/dashboard` - Dashboard (authenticated users)
- `/login` - Login/registration page
- `/admin/waitlist` - Admin panel for managing beta access (user_id = 1 only)

**Backend:**
- `/api/waitlist` - POST to join waitlist, GET for stats
- `/api/waitlist/confirm` - Email confirmation handler
- `/api/users/register` - Registration with allowlist check

**Database Tables:**
- `waitlist` - Email signups from landing page
- `allowed_emails` - Whitelist for beta access
- `feature_flags` - Global feature toggles

**Email:**
- Resend for transactional emails
- React Email for templates

---

## Database Setup

### 1. Run the Migration

Execute the SQL migration file to create required tables:

```bash
# Connect to your Supabase database
psql -h <your-supabase-host> -U postgres -d postgres

# Run the migration
\i migrations/002_landing_page_waitlist.sql
```

Or use the Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `migrations/002_landing_page_waitlist.sql`
3. Execute

### 2. Verify Tables

Check that the following tables were created:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('waitlist', 'allowed_emails', 'feature_flags');
```

### 3. Verify Feature Flags

```sql
SELECT * FROM feature_flags;
```

You should see:
- `registration_open` = `false` (closed beta)
- `landing_page_active` = `true` (show landing page)

---

## Environment Variables

### Required Variables

Add these to your `.env.local` file:

```env
# Resend API Key for email sending
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Base URL for your app (used in email links)
NEXT_PUBLIC_BASE_URL=https://golfiq.ca  # Production
# NEXT_PUBLIC_BASE_URL=http://localhost:3000  # Development

# Existing variables (should already be set)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Getting Your Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Free tier includes:
   - 3,000 emails/month
   - 100 emails/day
   - Perfect for beta testing
3. Go to API Keys → Create API Key
4. Copy and add to `.env.local`

---

## Resend Email Setup

### Using Shared Domain (Quick Start - Recommended for Beta)

**Pros:**
- Works immediately, no DNS setup required
- Emails sent from `onboarding@resend.dev`
- Perfect for beta testing

**Setup:**
1. Get API key from Resend
2. Add to `.env.local`
3. Done! Emails will work immediately.

**Email Template Location:**
- `emails/WaitlistConfirmation.tsx`

### Using Custom Domain (Production)

For production, you'll want emails from `hello@golfiq.ca` or `beta@golfiq.ca`.

**Setup:**
1. In Resend dashboard, go to Domains → Add Domain
2. Enter `golfiq.ca`
3. Add these DNS records to your domain registrar:

```
Type: TXT
Name: @
Value: (provided by Resend)

Type: MX
Name: @
Value: (provided by Resend)

Type: TXT
Name: resend._domainkey
Value: (provided by Resend - DKIM)
```

4. Wait 24-48 hours for DNS propagation
5. Verify domain in Resend dashboard
6. Update email sender in `app/api/waitlist/route.ts`:

```typescript
// Change from:
from: 'GolfIQ <onboarding@resend.dev>',

// To:
from: 'GolfIQ <hello@golfiq.ca>',
```

---

## Feature Flags

Control app behavior with feature flags in the database.

### Available Flags

| Flag Name | Description | Default |
|-----------|-------------|---------|
| `registration_open` | Allow public registration (not just allowlist) | `false` |
| `landing_page_active` | Show landing page at `/` | `true` |

### Updating Feature Flags

**Via SQL:**
```sql
UPDATE feature_flags
SET enabled = true
WHERE flag_name = 'registration_open';
```

**Via Supabase Dashboard:**
1. Go to Table Editor
2. Select `feature_flags` table
3. Edit the row
4. Change `enabled` column
5. Save

---

## User Flow

### New Visitor Flow

```
User visits golfiq.ca (/)
  ↓
Landing page displayed
  ↓
User enters email in waitlist form
  ↓
Email saved to waitlist table
  ↓
Confirmation email sent via Resend
  ↓
User clicks confirmation link in email
  ↓
Redirected to landing page with success message
  ↓
Admin grants beta access (adds to allowed_emails)
  ↓
User can now register at /login
```

### Beta User Registration Flow

```
User tries to register
  ↓
System checks feature_flags.registration_open
  ↓
If false, check allowed_emails table
  ↓
If email NOT in allowed_emails:
  → Show error: "Join our waitlist at golfiq.ca"
  → Block registration
  ↓
If email in allowed_emails:
  → Allow registration
  → Create account
  → Redirect to /dashboard
```

### Authenticated User Flow

```
Authenticated user visits golfiq.ca (/)
  ↓
Automatically redirected to /dashboard
  ↓
Never sees landing page
```

### Logout Flow

```
User clicks logout
  ↓
Session destroyed
  ↓
Redirected to /login (NOT landing page)
  ↓
User can log back in quickly
```

---

## Admin Panel

### Accessing the Admin Panel

**URL:** `/admin/waitlist`

**Access Control:**
- Only user with `id = 1` can access
- All other users redirected to `/dashboard`
- Unauthenticated users redirected to `/login`

### Admin Panel Features

1. **View Waitlist**
   - See all email signups
   - Check confirmation status
   - Export as CSV

2. **Manage Allowlist**
   - Add emails to allowlist (grant beta access)
   - Remove emails from allowlist
   - Add notes for why access was granted

3. **Quick Actions**
   - Grant beta access directly from waitlist table
   - Export waitlist as CSV for analysis

### Granting Beta Access

**Method 1: From Waitlist Table**
1. Go to `/admin/waitlist`
2. Find user in waitlist table
3. Click "Grant Access" button
4. User can now register

**Method 2: Manual Entry**
1. Go to `/admin/waitlist`
2. Enter email in "Add to Allowlist" form
3. Optionally add notes
4. Click "Add to Allowlist"

**Method 3: Direct SQL**
```sql
INSERT INTO allowed_emails (email, added_by, notes)
VALUES ('user@example.com', 'admin', 'Beta tester - friend');
```

---

## Testing

### Testing Locally

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Test Landing Page**
   - Visit `http://localhost:3000`
   - Should see landing page (unauthenticated)

3. **Test Waitlist Signup**
   - Enter email in form
   - Check console for email sent (won't actually send in dev)
   - Check Supabase `waitlist` table for entry

4. **Test Email Confirmation**
   - Get confirmation URL from console logs
   - Visit URL manually
   - Should redirect to landing with success message

5. **Test Beta Registration**
   - Add your email to `allowed_emails` table
   - Try to register at `/login`
   - Should succeed

6. **Test Blocked Registration**
   - Try to register with email NOT in `allowed_emails`
   - Should see beta message and be blocked

7. **Test Admin Panel**
   - Log in as user_id = 1
   - Visit `/admin/waitlist`
   - Should see admin interface

### Testing in Production

1. **Verify Resend**
   - Check Resend dashboard for sent emails
   - Verify delivery status

2. **Verify DNS** (if using custom domain)
   - Check Resend domain verification
   - Send test email to yourself

3. **Verify Database**
   - Check waitlist entries are being created
   - Check confirmation status updates

---

## Going Live

### Pre-Launch Checklist

- [ ] Database migration completed
- [ ] Resend API key configured
- [ ] Custom domain verified (if using)
- [ ] Feature flags set correctly:
  - `registration_open` = `false`
  - `landing_page_active` = `true`
- [ ] Admin panel accessible at `/admin/waitlist`
- [ ] Test email confirmation flow
- [ ] Test beta registration (allowed email)
- [ ] Test blocked registration (non-allowed email)
- [ ] Social media links working (@GolfIQApp)
- [ ] Screenshots displaying correctly
- [ ] Mobile responsive design tested
- [ ] DNS configured for golfiq.ca

### Launch Day

1. **Deploy to Vercel**
   ```bash
   git push origin main
   ```

2. **Verify Environment Variables**
   - Check Vercel dashboard
   - Ensure all env vars are set

3. **Test Production**
   - Visit golfiq.ca
   - Test waitlist signup
   - Check email delivery

4. **Monitor**
   - Watch Resend dashboard for emails
   - Check Supabase for waitlist entries
   - Monitor Vercel logs for errors

### Opening Beta to Specific Users

Grant access to beta testers:

1. Go to `/admin/waitlist`
2. Add their emails to allowlist
3. Notify them they can register
4. They visit `golfiq.ca` → Login → Register

### Opening Public Registration

When ready to launch publicly:

```sql
UPDATE feature_flags
SET enabled = true
WHERE flag_name = 'registration_open';
```

Now anyone can register, regardless of allowlist.

---

## Troubleshooting

### Emails Not Sending

**Check:**
1. `RESEND_API_KEY` is set correctly
2. Resend dashboard shows API requests
3. Check Resend logs for errors
4. Verify domain (if using custom domain)

**Fix:**
- Test with shared domain (`onboarding@resend.dev`) first
- Check Resend API key permissions
- Ensure API key is active

### Users Can't Register (Beta)

**Check:**
1. `feature_flags.registration_open` is `false`
2. Email is in `allowed_emails` table
3. Email matches exactly (case-insensitive)

**Fix:**
```sql
-- Add email to allowlist
INSERT INTO allowed_emails (email, added_by)
VALUES ('user@example.com', 'admin');
```

### Landing Page Not Showing

**Check:**
1. User is NOT authenticated
2. `/` route is landing page component
3. No redirect rules in middleware

**Fix:**
- Clear browser cookies
- Test in incognito mode
- Check `app/page.tsx` imports

### Admin Panel Access Denied

**Check:**
1. User is logged in
2. User ID is exactly `1`
3. Check `session?.user?.id` value

**Fix:**
```sql
-- Find your user ID
SELECT id, email FROM users WHERE email = 'your@email.com';

-- If needed, update user ID to 1 (careful!)
-- Only do this if you're the only admin
UPDATE users SET id = 1 WHERE email = 'your@email.com';
```

### Confirmation Links Not Working

**Check:**
1. `NEXT_PUBLIC_BASE_URL` is set correctly
2. Token exists in database
3. Token hasn't been used already

**Fix:**
- Verify `NEXT_PUBLIC_BASE_URL` matches your domain
- Check `waitlist.confirmation_token` column
- Check `waitlist.confirmed` is `false`

---

## File Structure

```
golfiq/
├── app/
│   ├── page.tsx                          # Landing page (redirects auth users)
│   ├── dashboard/page.tsx                # Main dashboard
│   ├── admin/waitlist/page.tsx           # Admin panel
│   ├── api/
│   │   ├── waitlist/
│   │   │   ├── route.ts                  # Waitlist signup
│   │   │   └── confirm/route.ts          # Email confirmation
│   │   └── users/register/route.ts       # Registration with allowlist check
│   └── app.css                           # Landing page styles added
│
├── components/landing/
│   ├── LandingHeader.tsx                 # Header with nav & CTA
│   ├── Hero.tsx                          # Hero section
│   ├── Features.tsx                      # Features grid
│   ├── InsightsCTA.tsx                   # AI insights showcase
│   ├── WaitlistForm.tsx                  # Email signup form
│   ├── SocialLinks.tsx                   # Social media icons
│   └── LandingFooter.tsx                 # Footer
│
├── emails/
│   └── WaitlistConfirmation.tsx          # Email template
│
├── lib/
│   └── resend.ts                         # Resend client
│
├── migrations/
│   └── 002_landing_page_waitlist.sql     # Database migration
│
├── public/photos/
│   ├── dashboard_1.PNG                   # Screenshot 1
│   ├── dashboard_2.PNG                   # Screenshot 2
│   └── dashboard_3.PNG                   # Screenshot 3
│
└── docs/
    └── LANDING_PAGE_SETUP.md             # This file
```

---

## API Reference

### POST /api/waitlist

Join the beta waitlist.

**Request:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",         // optional
  "handicap": "12"            // optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully added to waitlist! Check your email to confirm.",
  "waitlist_id": 123
}
```

**Response (Error - Already Registered):**
```json
{
  "error": "Email already registered on waitlist"
}
```

### GET /api/waitlist

Get waitlist statistics.

**Response:**
```json
{
  "count": 542
}
```

### GET /api/waitlist/confirm?token=xxx

Confirm email address.

**Redirect:**
- Success: `/?confirmed=true`
- Already confirmed: `/?already_confirmed=true`
- Invalid token: `/?error=invalid_token`

---

## Support

For issues or questions:
- Check [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- Review Vercel logs
- Check Supabase logs
- Check Resend dashboard

---

## Next Steps

After landing page is live:

1. **Phase 2: Achievement System**
   - See roadmap in KNOWN_ISSUES.md

2. **Phase 3: AI Coach MVP**
   - Post-round AI insights
   - Dashboard AI widget

3. **Phase 4: PWA & Polish**
   - Progressive Web App setup
   - iOS/Android installation

---

**Last Updated:** 2026-01-20
**Version:** 1.0.0
