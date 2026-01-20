# GolfIQ Beta Launch Checklist

**Last Updated:** 2026-01-20

---

## Pre-Launch Setup

### Database Setup
- [ ] Run migration `002_landing_page_waitlist.sql` in Supabase
- [ ] Verify `waitlist` table exists
- [ ] Verify `allowed_emails` table exists
- [ ] Verify `feature_flags` table exists
- [ ] Confirm `registration_open` = `false`
- [ ] Confirm `landing_page_active` = `true`

### Resend Email Setup
- [ ] Sign up for Resend account at [resend.com](https://resend.com)
- [ ] Create API key
- [ ] Add `RESEND_API_KEY` to `.env.local`
- [ ] (Optional) Configure custom domain `golfiq.ca`
- [ ] (Optional) Verify custom domain DNS records
- [ ] Test email sending locally

### Environment Variables
- [ ] `RESEND_API_KEY` set in `.env.local`
- [ ] `NEXT_PUBLIC_BASE_URL` set to production URL
- [ ] All existing env vars still configured
- [ ] `.env.local` not committed to git (in `.gitignore`)

### Local Testing
- [ ] Run `npm install` successfully
- [ ] Run `npm run dev` - no errors
- [ ] Visit `http://localhost:3000` - landing page loads
- [ ] Test waitlist signup
- [ ] Check Supabase for new waitlist entry
- [ ] Verify email sent (check console or Resend dashboard)
- [ ] Test email confirmation link
- [ ] Test admin panel at `/admin/waitlist`
- [ ] Grant yourself beta access
- [ ] Test registration with allowed email
- [ ] Test registration with non-allowed email (should block)
- [ ] Log out - redirect to `/login` ✓
- [ ] Log in - redirect to `/dashboard` ✓
- [ ] Visit `/` while logged in - redirect to `/dashboard` ✓

---

## Deployment to Vercel

### Code Deployment
- [ ] Commit all changes to git
  ```bash
  git add .
  git commit -m "Add landing page and beta waitlist system"
  ```
- [ ] Push to main branch
  ```bash
  git push origin main
  ```
- [ ] Verify Vercel deployment succeeds
- [ ] Check Vercel build logs for errors

### Vercel Environment Variables
- [ ] Add `RESEND_API_KEY` to Vercel
- [ ] Add `NEXT_PUBLIC_BASE_URL=https://golfiq.ca` to Vercel
- [ ] Verify all existing env vars are set
- [ ] Redeploy after adding env vars

### Domain Setup
- [ ] Point `golfiq.ca` to Vercel
- [ ] Configure DNS A/CNAME records
- [ ] Wait for DNS propagation (up to 48 hours)
- [ ] Verify SSL certificate issued
- [ ] Test `https://golfiq.ca` loads

---

## Post-Deployment Testing

### Production Verification
- [ ] Visit `https://golfiq.ca` - landing page loads
- [ ] Check responsiveness on mobile
- [ ] Check responsiveness on tablet
- [ ] Check responsiveness on desktop
- [ ] All screenshots display correctly
- [ ] Social media links work
- [ ] Footer links work
- [ ] Test waitlist signup with real email
- [ ] Receive confirmation email
- [ ] Click confirmation link - success message shows
- [ ] Check Supabase for waitlist entry
- [ ] Check Resend dashboard for sent email

### Admin Panel
- [ ] Log in as admin (user_id = 1)
- [ ] Visit `/admin/waitlist`
- [ ] See waitlist entries
- [ ] Add email to allowlist
- [ ] Export CSV - works correctly

### Beta Registration Flow
- [ ] Add test email to allowlist
- [ ] Log out
- [ ] Try to register with allowed email - succeeds
- [ ] Try to register with non-allowed email - blocked
- [ ] Error message shows correctly

### Authenticated User Flow
- [ ] Log in successfully
- [ ] Redirect to `/dashboard` ✓
- [ ] Visit `/` - redirect to `/dashboard` ✓
- [ ] Click logo - goes to `/dashboard` ✓
- [ ] Log out - redirect to `/login` ✓

---

## Beta Tester Invitation

### Prepare Beta Testers List
- [ ] Create list of initial beta testers
- [ ] Collect their email addresses
- [ ] Add all emails to `allowed_emails` table via admin panel

### Send Invitations
- [ ] Draft beta invitation email
- [ ] Include link to `https://golfiq.ca`
- [ ] Include instructions to register
- [ ] Include feedback email/form
- [ ] Send invitations
- [ ] Monitor for questions/issues

### Beta Tester Onboarding Email Template

```
Subject: You're Invited to GolfIQ Beta! 🏌️

Hi [Name],

You've been selected for early access to GolfIQ - the future of golf performance analytics!

Here's how to get started:

1. Visit https://golfiq.ca
2. Click "Login" in the top right
3. Click "Create Account"
4. Use this email address: [their email]
5. Complete registration and start tracking rounds!

Beta Features:
✅ Full premium access (free during beta)
✅ AI-powered insights
✅ Advanced analytics
✅ Social leaderboards
✅ Achievement tracking

We'd love your feedback! Reply to this email with any thoughts, bugs, or feature requests.

Happy golfing!
- The GolfIQ Team

https://golfiq.ca
@GolfIQApp
```

---

## Monitoring & Maintenance

### Daily Checks (First Week)
- [ ] Check Vercel logs for errors
- [ ] Check Supabase logs for issues
- [ ] Check Resend dashboard for email delivery
- [ ] Monitor waitlist signups
- [ ] Respond to beta tester feedback

### Weekly Checks
- [ ] Review waitlist count
- [ ] Export waitlist CSV for analysis
- [ ] Grant access to new testers
- [ ] Check for any reported bugs

---

## Optional Enhancements

### Analytics (Optional)
- [ ] Set up PostHog analytics
- [ ] Track waitlist signups
- [ ] Track beta registrations
- [ ] Track user engagement

### Marketing (Optional)
- [ ] Create social media posts
- [ ] Post on Instagram (@GolfIQApp)
- [ ] Post on X (@GolfIQApp)
- [ ] Post on Facebook (@GolfIQApp)
- [ ] Post on TikTok (@GolfIQApp)
- [ ] Post on Threads (@GolfIQApp)

### SEO (Optional)
- [ ] Add meta tags to landing page
- [ ] Add Open Graph tags
- [ ] Add Twitter Card tags
- [ ] Submit sitemap to Google
- [ ] Add Google Analytics

---

## Going Public (Future)

### When Ready for Public Launch
- [ ] Review beta feedback
- [ ] Fix any critical bugs
- [ ] Update pricing page if needed
- [ ] Set up custom Resend domain
- [ ] Update email sender to `hello@golfiq.ca`
- [ ] Enable public registration:
  ```sql
  UPDATE feature_flags
  SET enabled = true
  WHERE flag_name = 'registration_open';
  ```
- [ ] Announce public launch
- [ ] Remove beta messaging
- [ ] Update landing page copy

---

## Troubleshooting Quick Reference

### Issue: Emails not sending
**Check:** Resend API key, Resend dashboard, email logs
**Fix:** Verify API key, check Resend quota

### Issue: Can't register (beta user)
**Check:** Email in `allowed_emails` table
**Fix:** Add email via admin panel

### Issue: Landing page not showing
**Check:** User authentication status
**Fix:** Test in incognito mode

### Issue: Admin panel access denied
**Check:** User ID is exactly 1
**Fix:** Verify user ID in database

---

## Success Criteria

### Launch is successful when:
- [ ] Landing page live at golfiq.ca
- [ ] Waitlist signup working
- [ ] Emails delivering successfully
- [ ] Admin panel accessible
- [ ] Beta testers can register
- [ ] Non-beta users blocked appropriately
- [ ] No critical errors in logs
- [ ] Mobile experience smooth
- [ ] Beta testers giving positive feedback

---

## Emergency Contacts

**Vercel Support:** [vercel.com/support](https://vercel.com/support)
**Resend Support:** support@resend.com
**Supabase Support:** [supabase.com/support](https://supabase.com/support)

---

## Notes

Use this space for launch day notes, issues encountered, etc.

```
[Your notes here]
```

---

**Prepared:** 2026-01-20
**Status:** Ready for Launch 🚀
