# GolfIQ Database Schema

**Last Updated:** 2026-01-07
**Database:** PostgreSQL (Supabase)
**ORM:** Prisma

---

## Overview

This document describes the complete database schema for GolfIQ. All tables use `bigint` for primary keys and foreign keys for scalability.

**Naming Conventions:**
- Tables: `snake_case` (e.g., `user_profiles`)
- Columns: `snake_case` (e.g., `created_date`)
- Timestamps: `created_date` and `updated_date` for all tables
- Foreign Keys: `{table}_id` format (e.g., `user_id`)

---

## Tables

### Users & Authentication

#### `users`
Core user account table with authentication and subscription information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Unique user identifier |
| `username` | varchar | NOT NULL, UNIQUE | Unique username |
| `email` | varchar | NOT NULL, UNIQUE | User email address |
| `password_hash` | varchar | NOT NULL | Bcrypt hashed password |
| `active` | boolean | NOT NULL, DEFAULT true | Account active status |
| `email_verified` | boolean | NOT NULL, DEFAULT false | Email verification status |
| `subscription_tier` | SubscriptionTier | NOT NULL, DEFAULT 'free' | free, premium, lifetime |
| `subscription_status` | SubscriptionStatus | NOT NULL, DEFAULT 'active' | active, cancelled, past_due |
| `subscription_start_date` | timestamp | | Subscription start date |
| `subscription_end_date` | timestamp | | Subscription end date |
| `stripe_customer_id` | varchar | UNIQUE | Stripe customer ID |
| `stripe_subscription_id` | varchar | UNIQUE | Stripe subscription ID |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Account creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `username` (UNIQUE)
- `email` (UNIQUE)
- `stripe_customer_id` (UNIQUE)
- `stripe_subscription_id` (UNIQUE)

---

#### `user_profiles`
Extended user profile information and preferences.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Profile identifier |
| `user_id` | bigint | NOT NULL, UNIQUE, FK → users | Reference to user |
| `first_name` | varchar | | User's first name |
| `last_name` | varchar | | User's last name |
| `avatar_url` | varchar | NOT NULL, DEFAULT '/avatars/default.png' | Profile picture URL |
| `bio` | text | | User biography |
| `gender` | Gender | NOT NULL, DEFAULT 'unspecified' | male, female, unspecified |
| `default_tee` | DefaultTee | NOT NULL, DEFAULT 'white' | blue, white, red, gold, black |
| `favorite_course_id` | bigint | FK → courses | User's favorite course |
| `dashboard_visibility` | DashboardVisibility | NOT NULL, DEFAULT 'friends' | private, friends, public |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Profile creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `user_id` (UNIQUE)

---

#### `user_leaderboard_stats`
Cached leaderboard statistics for performance optimization.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Stats identifier |
| `user_id` | bigint | NOT NULL, UNIQUE, FK → users | Reference to user |
| `handicap` | numeric | | Current handicap index |
| `average_score` | numeric | | Average score across all rounds |
| `best_score` | smallint | | Best round score |
| `total_rounds` | integer | NOT NULL, DEFAULT 0 | Total rounds played |
| `updated_date` | timestamp | NOT NULL | Last calculation timestamp |

**Indexes:**
- `user_id` (UNIQUE)
- `handicap` (for leaderboard sorting)
- `average_score` (for leaderboard sorting)

**Note:** This table is updated after each round is saved/edited/deleted to maintain fast leaderboard queries.

---

### Courses & Tees

#### `courses`
Golf course information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Course identifier |
| `club_name` | varchar | NOT NULL | Name of the golf club |
| `course_name` | varchar | NOT NULL | Name of the course |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Course creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `club_name` (for search)
- `course_name` (for search)

---

#### `locations`
Geographic location data for courses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Location identifier |
| `course_id` | bigint | NOT NULL, FK → courses | Reference to course |
| `address` | varchar | | Street address |
| `city` | varchar | | City name |
| `state` | varchar | | State/province |
| `country` | varchar | | Country |
| `latitude` | numeric | | GPS latitude |
| `longitude` | numeric | | GPS longitude |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Location creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `course_id`
- `city` (for search)
- `state` (for search)

---

#### `tees`
Tee box information with ratings and measurements.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Tee identifier |
| `course_id` | bigint | NOT NULL, FK → courses | Reference to course |
| `tee_name` | varchar | NOT NULL | Tee name (e.g., "Blue", "Championship") |
| `gender` | TeeGender | NOT NULL | male, female |
| `course_rating` | numeric | | USGA course rating (18 holes) |
| `slope_rating` | integer | | USGA slope rating (18 holes) |
| `bogey_rating` | numeric | | Bogey golfer rating |
| `total_yards` | integer | | Total yardage |
| `total_meters` | integer | | Total meters |
| `number_of_holes` | integer | | 9 or 18 holes |
| `par_total` | integer | | Total par for the tee |
| `front_course_rating` | numeric | | Front 9 course rating |
| `front_slope_rating` | integer | | Front 9 slope rating |
| `front_bogey_rating` | numeric | | Front 9 bogey rating |
| `back_course_rating` | numeric | | Back 9 course rating |
| `back_slope_rating` | integer | | Back 9 slope rating |
| `back_bogey_rating` | numeric | | Back 9 bogey rating |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Tee creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `course_id`
- `gender`

---

#### `holes`
Individual hole information for each tee.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Hole identifier |
| `tee_id` | bigint | NOT NULL, FK → tees | Reference to tee |
| `hole_number` | integer | NOT NULL | Hole number (1-18) |
| `par` | integer | NOT NULL | Par for the hole |
| `yardage` | integer | NOT NULL | Yardage from this tee |
| `handicap` | integer | | Stroke index (1-18) |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Hole creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `tee_id`
- `hole_number`

---

### Rounds & Scoring

#### `rounds`
Golf round tracking with summary statistics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Round identifier |
| `user_id` | bigint | NOT NULL, FK → users | Reference to user |
| `course_id` | bigint | NOT NULL, FK → courses | Reference to course |
| `tee_id` | bigint | NOT NULL, FK → tees | Reference to tee played |
| `date` | date | NOT NULL | Date round was played |
| `score` | integer | NOT NULL | Total score |
| `hole_by_hole` | boolean | NOT NULL, DEFAULT false | Whether hole-by-hole data exists |
| `advanced_stats` | boolean | NOT NULL, DEFAULT false | Whether FIR/GIR/putts tracked |
| `fir_hit` | integer | | Fairways in regulation hit |
| `gir_hit` | integer | | Greens in regulation hit |
| `putts` | integer | | Total putts |
| `penalties` | integer | | Total penalty strokes |
| `notes` | text | | User notes about the round |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Round creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `user_id`
- `course_id`
- `date`
- `user_id, date` (composite for recent rounds queries)

**Notes:**
- If `hole_by_hole` is false, only total score is saved (quick mode)
- If `advanced_stats` is true, FIR/GIR/putts/penalties are tracked
- FIR opportunities calculated as: par 4s + par 5s = 14 for 18-hole round

---

#### `round_holes`
Hole-by-hole scoring data for detailed rounds.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Round hole identifier |
| `round_id` | bigint | NOT NULL, FK → rounds (CASCADE) | Reference to round |
| `hole_id` | bigint | NOT NULL, FK → holes | Reference to hole definition |
| `score` | integer | NOT NULL | Score on this hole |
| `fir_hit` | integer | | 1 if fairway hit, 0 if missed, NULL if N/A |
| `gir_hit` | integer | | 1 if green hit, 0 if missed, NULL if N/A |
| `putts` | integer | | Number of putts on this hole |
| `penalties` | integer | | Number of penalty strokes |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Entry creation timestamp |
| `updated_date` | timestamp | NOT NULL | Last update timestamp |

**Indexes:**
- `round_id`
- `hole_id`

**Notes:**
- Only exists when `rounds.hole_by_hole = true`
- Deleted CASCADE when parent round is deleted

---

### Social Features

#### `friends`
Established friendships between users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Friendship identifier |
| `user_id` | bigint | NOT NULL, FK → users | First user in friendship |
| `friend_id` | bigint | NOT NULL, FK → users | Second user in friendship |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Friendship established timestamp |

**Indexes:**
- `user_id`
- `friend_id`
- `user_id, friend_id` (composite, UNIQUE)

**Notes:**
- Bidirectional relationship (both directions stored)
- When user A adds user B, two rows are created: (A, B) and (B, A)

---

#### `friend_requests`
Pending friend requests between users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Request identifier |
| `requester_id` | bigint | NOT NULL, FK → users | User sending the request |
| `recipient_id` | bigint | NOT NULL, FK → users | User receiving the request |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Request sent timestamp |

**Indexes:**
- `requester_id`
- `recipient_id`
- `requester_id, recipient_id` (composite, UNIQUE)

**Notes:**
- When accepted, rows are deleted and `friends` entries created
- When rejected/cancelled, row is deleted

---

### Subscription Management

#### `subscription_events`
Audit log of subscription changes for tracking and analytics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Event identifier |
| `user_id` | bigint | NOT NULL, FK → users | Reference to user |
| `event_type` | varchar | NOT NULL | Event type (tier_change, status_change, etc) |
| `old_tier` | varchar | | Previous subscription tier |
| `new_tier` | varchar | | New subscription tier |
| `old_status` | varchar | | Previous subscription status |
| `new_status` | varchar | | New subscription status |
| `stripe_event_id` | varchar | | Stripe webhook event ID |
| `metadata` | jsonb | | Additional event data |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Event timestamp |

**Indexes:**
- `user_id`
- `event_type`
- `created_date`

---

#### `lifetime_grants`
Admin-granted lifetime premium access records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigint | PRIMARY KEY, AUTO INCREMENT | Grant identifier |
| `user_id` | bigint | NOT NULL, FK → users | Reference to user |
| `granted_by` | varchar | NOT NULL | Admin username who granted access |
| `reason` | text | NOT NULL | Reason for granting lifetime access |
| `created_date` | timestamp | NOT NULL, DEFAULT now() | Grant timestamp |

**Indexes:**
- `user_id`

**Notes:**
- Used for early supporters, influencers, contest winners
- When granted, user's `subscription_tier` is set to 'lifetime'

---

## Enums (Custom Types)

### `SubscriptionTier`
User subscription level.

```sql
CREATE TYPE "SubscriptionTier" AS ENUM (
  'free',
  'premium',
  'lifetime'
);
```

---

### `SubscriptionStatus`
Current subscription state.

```sql
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'active',
  'cancelled',
  'past_due'
);
```

---

### `Gender`
User gender for profile and tee selection.

```sql
CREATE TYPE "Gender" AS ENUM (
  'male',
  'female',
  'unspecified'
);
```

---

### `DefaultTee`
User's preferred tee box.

```sql
CREATE TYPE "DefaultTee" AS ENUM (
  'blue',
  'white',
  'red',
  'gold',
  'black'
);
```

---

### `TeeGender`
Gender classification for tee boxes (for course rating purposes).

```sql
CREATE TYPE "TeeGender" AS ENUM (
  'male',
  'female'
);
```

---

### `DashboardVisibility`
Dashboard privacy settings.

```sql
CREATE TYPE "DashboardVisibility" AS ENUM (
  'private',   -- Only user can view
  'friends',   -- Friends can view
  'public'     -- Anyone can view
);
```

---

## Future Tables (Planned)

### Achievement System (Phase 2)

#### `achievement_definitions`
Master list of all possible achievements.

```sql
CREATE TABLE achievement_definitions (
  id bigint PRIMARY KEY,
  type varchar NOT NULL UNIQUE,
  name varchar NOT NULL,
  description text NOT NULL,
  icon varchar,
  bronze_threshold integer NOT NULL,
  silver_threshold integer NOT NULL,
  gold_threshold integer NOT NULL,
  platinum_threshold integer NOT NULL,
  diamond_threshold integer NOT NULL,
  created_date timestamp NOT NULL DEFAULT now(),
  updated_date timestamp NOT NULL
);
```

#### `user_achievements`
User progress towards achievements.

```sql
CREATE TABLE user_achievements (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id bigint NOT NULL REFERENCES achievement_definitions(id),
  current_count integer NOT NULL DEFAULT 0,
  highest_tier varchar, -- BRONZE, SILVER, GOLD, PLATINUM, DIAMOND
  bronze_earned_at timestamp,
  silver_earned_at timestamp,
  gold_earned_at timestamp,
  platinum_earned_at timestamp,
  diamond_earned_at timestamp,
  created_date timestamp NOT NULL DEFAULT now(),
  updated_date timestamp NOT NULL,
  UNIQUE(user_id, achievement_id)
);
```

#### `achievement_notifications`
Achievement unlock notifications.

```sql
CREATE TABLE achievement_notifications (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id bigint NOT NULL,
  tier varchar NOT NULL,
  round_id bigint REFERENCES rounds(id),
  is_read boolean NOT NULL DEFAULT false,
  created_date timestamp NOT NULL DEFAULT now()
);
```

---

### AI Coach System (Phase 3)

#### `ai_insights`
Stored AI-generated insights and analyses.

```sql
CREATE TABLE ai_insights (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id bigint REFERENCES rounds(id) ON DELETE CASCADE,
  course_id bigint REFERENCES courses(id),
  insight_type varchar NOT NULL, -- 'post_round', 'dashboard_summary', 'course_matchup'
  content jsonb NOT NULL,
  created_date timestamp NOT NULL DEFAULT now()
);
```

#### `ai_chat_messages`
Conversational AI coach chat history.

```sql
CREATE TABLE ai_chat_messages (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar NOT NULL, -- 'user' or 'assistant'
  content text NOT NULL,
  context jsonb, -- Stats snapshot used for this message
  created_date timestamp NOT NULL DEFAULT now()
);
```

#### `ai_usage_quotas`
Track AI feature usage for rate limiting.

```sql
CREATE TABLE ai_usage_quotas (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_messages_used integer NOT NULL DEFAULT 0,
  last_reset_at timestamp NOT NULL DEFAULT now(),
  created_date timestamp NOT NULL DEFAULT now(),
  updated_date timestamp NOT NULL
);
```

---

## Relationships Diagram

```
users (1) ──→ (1) user_profiles
users (1) ──→ (1) user_leaderboard_stats
users (1) ──→ (N) rounds
users (1) ──→ (N) friends
users (1) ──→ (N) friend_requests
users (1) ──→ (N) subscription_events
users (1) ──→ (1?) lifetime_grants

courses (1) ──→ (1?) locations
courses (1) ──→ (N) tees
courses (1) ──→ (N) rounds

tees (1) ──→ (N) holes
tees (1) ──→ (N) rounds

rounds (1) ──→ (N) round_holes

holes (1) ──→ (N) round_holes
```

---

## Key Queries & Performance Considerations

### 1. Dashboard Stats Calculation
```sql
-- Get user's recent rounds with tee data
SELECT r.*, t.course_rating, t.slope_rating, t.par_total
FROM rounds r
JOIN tees t ON r.tee_id = t.id
WHERE r.user_id = :userId
  AND r.date >= :dateFilter
ORDER BY r.date DESC
LIMIT :limit;

-- Index: rounds(user_id, date)
```

### 2. Leaderboard Query
```sql
-- Fast leaderboard using cached stats
SELECT u.username, up.avatar_url, uls.*
FROM user_leaderboard_stats uls
JOIN users u ON uls.user_id = u.id
JOIN user_profiles up ON u.id = up.user_id
WHERE uls.handicap IS NOT NULL
ORDER BY uls.handicap ASC, uls.average_score ASC, uls.total_rounds DESC
LIMIT 100;

-- Index: user_leaderboard_stats(handicap)
```

### 3. Friends Leaderboard
```sql
-- Get stats for user's friends only
SELECT u.username, up.avatar_url, uls.*
FROM user_leaderboard_stats uls
JOIN users u ON uls.user_id = u.id
JOIN user_profiles up ON u.id = up.user_id
WHERE uls.user_id IN (
  SELECT friend_id FROM friends WHERE user_id = :userId
)
ORDER BY uls.handicap ASC
LIMIT 100;

-- Index: friends(user_id)
```

### 4. Course Search
```sql
-- Search courses by name or location
SELECT c.*, l.city, l.state
FROM courses c
LEFT JOIN locations l ON c.id = l.course_id
WHERE
  c.club_name ILIKE :search
  OR c.course_name ILIKE :search
  OR l.city ILIKE :search
ORDER BY c.club_name, c.course_name
LIMIT 20 OFFSET :offset;

-- Indexes: courses(club_name), courses(course_name), locations(city)
```

---

## Migration Strategy

### Current State
- Schema is managed via Prisma migrations
- Migration history stored in `_prisma_migrations` table

### Adding New Features
1. Update Prisma schema file (`prisma/schema.prisma`)
2. Generate migration: `npx prisma migrate dev --name feature_name`
3. Update this documentation file
4. Test migration on staging database
5. Deploy to production

### Rollback Strategy
- Keep migration SQL files in version control
- Create rollback scripts for each migration
- Test rollbacks on staging before production

---

## Data Retention Policy

### Active Data (Kept Indefinitely)
- User accounts and profiles
- All rounds and hole-by-hole data
- Course information
- Friendships and social data

### Audit Logs (Kept 2 Years)
- `subscription_events` older than 2 years
- `achievement_notifications` older than 1 year (mark as read)

### Temporary Data (Deleted After Use)
- Password reset tokens (future feature)
- Email verification tokens (future feature)

---

## Backup & Recovery

### Backup Schedule (Production)
- **Continuous:** Supabase Point-in-Time Recovery (PITR)
- **Daily:** Full database snapshots (retained 30 days)
- **Weekly:** Full exports to S3 (retained 90 days)

### Recovery Time Objective (RTO)
- Target: < 1 hour for complete restore
- PITR available for last 7 days

### Recovery Point Objective (RPO)
- Target: < 5 minutes of data loss
- Achieved via Supabase replication

---

## Change Log

### 2026-01-07 - Initial Documentation
- Documented all existing tables
- Added enums and custom types
- Outlined future tables for achievements and AI systems
- Added performance considerations and indexes

---

## Notes

- All timestamps stored in UTC
- All `bigint` IDs for scalability (supports 2^63 rows)
- Foreign key constraints enforce referential integrity
- Cascade deletes on `round_holes` when round is deleted
- No soft deletes - data is permanently removed when deleted
