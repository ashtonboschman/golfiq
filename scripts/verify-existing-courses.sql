-- ============================================
-- Mark All Existing Courses as Verified
-- ============================================
-- Run this SQL in Supabase SQL Editor or your database client
-- This is a one-time operation to verify all courses that existed
-- before the verification system was added.

-- Show current counts BEFORE update
SELECT
  'BEFORE UPDATE' as status,
  verified,
  COUNT(*) as course_count
FROM courses
GROUP BY verified
ORDER BY verified;

-- Mark all courses as verified
UPDATE courses
SET verified = true
WHERE verified = false;

-- Show updated counts AFTER update
SELECT
  'AFTER UPDATE' as status,
  verified,
  COUNT(*) as course_count
FROM courses
GROUP BY verified
ORDER BY verified;

-- Show sample of verified courses
SELECT
  id,
  course_name,
  club_name,
  verified,
  created_date
FROM courses
WHERE verified = true
ORDER BY created_date DESC
LIMIT 10;
