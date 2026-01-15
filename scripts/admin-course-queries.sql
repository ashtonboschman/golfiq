-- ============================================
-- GolfIQ Admin Course Management Queries
-- ============================================

-- Find all unverified courses (user-submitted)
-- Use this to quickly review courses added by users
SELECT
  c.id,
  c.course_name,
  c.club_name,
  c.verified,
  l.city,
  l.state,
  l.country,
  c.created_date,
  COUNT(DISTINCT t.id) as tee_count
FROM courses c
LEFT JOIN locations l ON c.id = l.course_id
LEFT JOIN tees t ON c.id = t.course_id
WHERE c.verified = false
GROUP BY c.id, c.course_name, c.club_name, c.verified, l.city, l.state, l.country, c.created_date
ORDER BY c.created_date DESC;

-- Verify a course (mark as verified)
-- Replace COURSE_ID with the actual course ID
-- UPDATE courses SET verified = true WHERE id = COURSE_ID;

-- Get detailed info about a specific course including all tees
-- Replace COURSE_ID with the actual course ID
SELECT
  c.id as course_id,
  c.course_name,
  c.club_name,
  c.verified,
  l.city,
  l.state,
  l.country,
  t.id as tee_id,
  t.tee_name,
  t.gender,
  t.course_rating,
  t.slope_rating,
  t.par_total,
  t.total_yards
FROM courses c
LEFT JOIN locations l ON c.id = l.course_id
LEFT JOIN tees t ON c.id = t.course_id
WHERE c.id = COURSE_ID
ORDER BY t.gender, t.tee_name;

-- Count verified vs unverified courses
SELECT
  verified,
  COUNT(*) as course_count
FROM courses
GROUP BY verified;

-- Find courses with no tees (potential data issues)
SELECT
  c.id,
  c.course_name,
  c.club_name,
  c.verified
FROM courses c
LEFT JOIN tees t ON c.id = t.course_id
WHERE t.id IS NULL;

-- Find recently added unverified courses (last 7 days)
SELECT
  c.id,
  c.course_name,
  c.club_name,
  l.city,
  l.state,
  c.created_date
FROM courses c
LEFT JOIN locations l ON c.id = l.course_id
WHERE c.verified = false
  AND c.created_date >= NOW() - INTERVAL '7 days'
ORDER BY c.created_date DESC;

-- Batch verify multiple courses
-- Replace the IDs in the array with actual course IDs
-- UPDATE courses SET verified = true WHERE id = ANY(ARRAY[1, 2, 3, 4, 5]);
