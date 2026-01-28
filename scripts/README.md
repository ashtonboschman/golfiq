# Admin Scripts & Queries

This directory contains administrative scripts and SQL queries for managing GolfIQ.

## Prerequisites

- Node.js installed
- Access to the production database
- Admin privileges

## Course Management SQL Queries

### admin-course-queries.sql

Pre-built SQL queries for managing user-submitted courses. Run these queries directly in your database client (Supabase SQL Editor, pgAdmin, etc.).

**Key Queries:**

1. **Find Unverified Courses** - List all courses added by users that haven't been admin-verified
2. **Verify a Course** - Mark a course as verified after review
3. **Course Details** - Get full information about a specific course including all tees
4. **Count Stats** - See how many courses are verified vs unverified
5. **Find Issues** - Identify courses with no tees (potential data problems)
6. **Recent Additions** - View courses added in the last 7 days
7. **Batch Verify** - Verify multiple courses at once

**Usage:**
```sql
-- Example: Find all unverified courses
SELECT
  c.id,
  c.course_name,
  c.club_name,
  l.city,
  l.state,
  c.created_at,
  COUNT(DISTINCT t.id) as tee_count
FROM courses c
LEFT JOIN locations l ON c.id = l.course_id
LEFT JOIN tees t ON c.id = t.course_id
WHERE c.verified = false
GROUP BY c.id, c.course_name, c.club_name, l.city, l.state, c.created_at
ORDER BY c.created_at DESC;

-- Example: Verify a course
UPDATE courses SET verified = true WHERE id = 12345;
```

### verify-existing-courses.sql

One-time SQL script to mark all existing courses as verified. Run this when you first deploy the verification system to verify all courses that were already in the database.

**Usage:**
1. Open Supabase SQL Editor (or your database client)
2. Paste the contents of `verify-existing-courses.sql`
3. Run the query
4. Check the BEFORE/AFTER counts to confirm

**What it does:**
- Shows counts before update
- Marks all courses as verified (`UPDATE courses SET verified = true`)
- Shows counts after update
- Displays sample of verified courses

---

## Subscription Management Scripts

### 1. Grant Lifetime Access

Grant lifetime premium access to a user.

**Command:**
```bash
npm run lifetime:grant <email> <granted_by> <reason>
```

**Example:**
```bash
npm run lifetime:grant user@example.com admin@golfapp.com "Early supporter reward"
```

**Options:**
- `--force` - Grant even if user already has lifetime access

**What it does:**
- Validates the user exists
- Updates subscription tier to "lifetime"
- Sets subscription status to "active"
- Removes subscription end date (never expires)
- Creates a LifetimeGrant record for audit trail
- Logs a subscription event

**Notes:**
- If user has an active Stripe subscription, you may want to cancel it manually in Stripe Dashboard
- The script will warn you but won't automatically cancel it

---

### 2. Revoke Lifetime Access

Revoke lifetime premium access from a user (downgrade to free).

**Command:**
```bash
npm run lifetime:revoke <email> <reason>
```

**Example:**
```bash
npm run lifetime:revoke user@example.com "Policy violation"
```

**What it does:**
- Validates the user has lifetime access
- Updates subscription tier to "free"
- Sets subscription status to "active"
- Logs a subscription event
- Preserves grant records for audit trail (doesn't delete them)

**Notes:**
- Grant records are kept as audit trail but are no longer active
- Consider notifying the user via email

---

### 3. List Lifetime Users

View all users who currently have lifetime access.

**Command:**
```bash
npm run lifetime:list
```

**What it shows:**
- User information (username, email, ID)
- Subscription status
- Member since date
- Grant details (granted by, reason, date)
- Summary statistics

---

## Use Cases

### Early Supporters
Grant lifetime access to users who supported the app early:
```bash
npm run lifetime:grant johndoe@example.com admin@golfapp.com "Early supporter - backed us from day 1"
```

### Contest Winners
Award lifetime access as a prize:
```bash
npm run lifetime:grant winner@example.com admin@golfapp.com "Won the Q4 2025 Tournament Contest"
```

### Beta Testers
Reward beta testers:
```bash
npm run lifetime:grant tester@example.com admin@golfapp.com "Beta tester - provided valuable feedback"
```

### Staff/Team Members
Give access to team members:
```bash
npm run lifetime:grant teamember@golfapp.com admin@golfapp.com "Team member"
```

### Influencer Partnerships
Partner with influencers:
```bash
npm run lifetime:grant influencer@example.com admin@golfapp.com "Partnership - Golf Pro YouTuber"
```

---

## Security

- These scripts require direct database access
- Only run these on a secure, trusted machine
- Keep a log of all lifetime grants
- Never share the database credentials
- Consider implementing a web-based admin panel for production use

---

## Audit Trail

All lifetime grants are tracked in the database:
- `lifetime_grants` table stores who granted access, when, and why
- `subscription_events` table logs all subscription changes
- Grant records are never deleted, only made inactive

To view audit history for a user, query the database:
```sql
SELECT * FROM lifetime_grants WHERE user_id = <user_id>;
SELECT * FROM subscription_events WHERE user_id = <user_id> ORDER BY created_at DESC;
```

---

## Troubleshooting

### "User not found"
- Check that the email is correct
- Verify the user exists in the database
- Email is case-sensitive

### "User already has lifetime access"
- Check existing grants with `npm run lifetime:list`
- Use `--force` flag to grant anyway if needed

### Database connection errors
- Verify DATABASE_URL in .env is correct
- Check network connectivity to database
- Ensure database is running

---

## Future Enhancements

Consider building:
- Web-based admin dashboard for managing grants
- Automated email notifications when granting/revoking access
- Bulk grant operations
- Export reports to CSV
- Approval workflow for grant requests
