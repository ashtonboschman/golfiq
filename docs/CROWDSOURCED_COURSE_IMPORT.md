# Crowdsourced Course Import System

**Completed:** January 7, 2026
**Status:** Production Ready ✅

---

## Overview

The Crowdsourced Course Import system allows any authenticated user to search for and add golf courses from the Golf Course Gurus API to the GolfIQ database. This feature addresses the challenge of building a comprehensive course library without requiring admin intervention for every course addition.

---

## Key Features

### 1. User-Friendly Course Search
- **Search Interface:** Simple text input for course name or city
- **API Integration:** Searches Golf Course Gurus API for courses not in local database
- **No JSON Exposure:** Users never see raw API responses - clean UI throughout

### 2. Smart Rate Limiting
- **Global Daily Limit:** 200 API calls per day (shared across all users)
- **Database Tracking:** All API calls logged in `api_usage_logs` table
- **Graceful Degradation:** Clear error messages when limit reached
- **Reset Schedule:** Limit resets at midnight UTC

### 3. Data Quality Safeguards
- **Tee Validation:** Automatically rejects:
  - Tees with "Combo" in the name
  - Tees containing "/" (e.g., "White / Red")
- **User Feedback:** Informs users when tees are rejected during import
- **Duplicate Prevention:** Returns 409 error if course already exists
- **Zero-Tee Filtering:** Courses with no valid tees are hidden from search results

### 4. Course Verification System
- **Default Status:** All user-submitted courses marked as `verified = false`
- **Admin Review:** Admins can quickly find unverified courses using SQL queries
- **Database Index:** Optimized querying with `idx_course_verified` index
- **Admin Queries:** Pre-built SQL queries in `scripts/admin-course-queries.sql`

---

## Technical Implementation

### Database Changes

#### New Table: `api_usage_logs`
```sql
CREATE TABLE api_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  endpoint VARCHAR(100) NOT NULL,
  user_id BIGINT NULL,
  ip_address VARCHAR(45) NULL,
  created_date TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_usage_endpoint_date ON api_usage_logs (endpoint, created_date);
CREATE INDEX idx_api_usage_user_date ON api_usage_logs (user_id, created_date);
```

**Purpose:** Track API usage for rate limiting and analytics

#### Course Model Update: `verified` Field
```sql
ALTER TABLE courses ADD COLUMN verified BOOLEAN DEFAULT false;
CREATE INDEX idx_course_verified ON courses (verified);
```

**Purpose:** Track which courses have been admin-verified vs user-submitted

### Files Created

#### 0. `scripts/admin-course-queries.sql`
**Purpose:** Pre-built SQL queries for admin course management

**Queries Included:**
- Find all unverified courses
- Verify a course (mark as verified)
- Get detailed course info with all tees
- Count verified vs unverified courses
- Find courses with no tees
- Find recently added unverified courses (last 7 days)
- Batch verify multiple courses

#### 1. `lib/utils/apiRateLimit.ts`
**Purpose:** Centralized rate limiting logic

**Key Functions:**
- `checkRateLimit(endpoint, dailyLimit)` - Returns whether API call can proceed
- `logApiCall(endpoint, userId, ipAddress)` - Records API usage
- `getApiUsageStats(endpoint, dailyLimit)` - Returns usage stats for display

**Usage Example:**
```typescript
const rateLimit = await checkRateLimit('golf-course-api-search', 200);
if (!rateLimit.canProceed) {
  return errorResponse('Daily API limit reached', 429);
}
await logApiCall('golf-course-api-search');
```

#### 2. `app/courses/search/page.tsx`
**Purpose:** User-facing course search and import interface

**Features:**
- Course search with debouncing
- Tee selection checkboxes
- Import with validation
- Error handling and user feedback
- Navigation back to courses page on success

**Route:** `/courses/search`

### Files Modified

#### 1. `app/api/golf-course-api/search/route.ts`
**Changes:**
- Added rate limit check before external API call
- Logs successful API calls
- Returns 429 status with usage stats when limit exceeded

**Before:**
```typescript
const response = await fetch(apiUrl);
return NextResponse.json(data);
```

**After:**
```typescript
const rateLimit = await checkRateLimit('golf-course-api-search', 200);
if (!rateLimit.canProceed) {
  return NextResponse.json({ error: '...' }, { status: 429 });
}
const response = await fetch(apiUrl);
await logApiCall('golf-course-api-search');
return NextResponse.json(data);
```

#### 2. `app/api/courses/route.ts` (POST method)
**Changes:**
- Added tee name validation loop
- Skips tees with "Combo" or "/"
- Tracks rejected tees
- Includes rejection info in success response

**Validation Logic:**
```typescript
const teeName = tee_name || '';
if (teeName.toLowerCase().includes('combo') || teeName.includes('/')) {
  rejectedTees.push(`${teeName} (${gender})`);
  continue; // Skip this tee
}
```

**Enhanced Response:**
```typescript
let message = 'Course created successfully';
if (rejectedTees.length > 0) {
  message += `. Note: ${rejectedTees.length} tee(s) were skipped (Combo or "/" tees)`;
}
```

#### 3. `app/courses/page.tsx`
**Changes:**
- Added "Add New Course" button in header
- Enhanced empty state with CTA to search page
- Improved layout with flex container

**UI Enhancements:**
- Button always visible in header for easy access
- Empty state encourages course contribution
- Seamless navigation to `/courses/search`

---

## User Flow

### Adding a New Course

1. **Navigate to Courses Page** (`/courses`)
2. **Click "Add New Course"** button
3. **Search for Course** by name or city
4. **Select Course** from search results
5. **Review Tees** - select which tees to import
6. **Click "Add Course to Database"**
7. **Automatic Redirect** to courses page after 2 seconds

### Handling Errors

#### Course Already Exists (409)
```
"This course already exists in the database!"
```
User is notified without adding duplicate data.

#### API Limit Reached (429)
```
"API limit reached (195/200 calls used today). Please try again tomorrow."
```
Clear feedback on when they can try again.

#### Invalid Tees Rejected
```
"Course created successfully. Note: 2 tee(s) were skipped (Combo or "/" tees):
White / Red (male), Combo (female)"
```
User sees course was added but understands why certain tees were excluded.

---

## API Endpoints

### `GET /api/golf-course-api/search`

**Purpose:** Search Golf Course Gurus API with rate limiting

**Query Parameters:**
- `query` (required) - Course name or city to search

**Rate Limit:** 200 calls/day globally

**Response (Success - 200):**
```json
{
  "courses": [
    {
      "id": 12345,
      "course_name": "Pebble Beach Golf Links",
      "club_name": "Pebble Beach Company",
      "location": {
        "city": "Pebble Beach",
        "state": "California",
        "country": "USA"
      },
      "tees": {
        "male": [...],
        "female": [...]
      }
    }
  ]
}
```

**Response (Rate Limit - 429):**
```json
{
  "error": "Daily API limit reached. Please try again tomorrow.",
  "callsUsed": 200,
  "limit": 200
}
```

### `POST /api/courses`

**Purpose:** Create course with tee validation

**Request Body:**
```json
{
  "id": 12345,
  "club_name": "Example Golf Club",
  "course_name": "Championship Course",
  "location": {
    "city": "Augusta",
    "state": "Georgia",
    "country": "USA"
  },
  "tees": {
    "male": [...],
    "female": [...]
  }
}
```

**Validation Rules:**
- Reject tees with "combo" (case-insensitive) in name
- Reject tees containing "/" character
- At least one valid tee required

**Response (Success - 200):**
```json
{
  "type": "success",
  "message": "Course created successfully. Note: 1 tee(s) were skipped (Combo or \"/\" tees): White / Red (male)",
  "course": {...},
  "rejectedTees": ["White / Red (male)"]
}
```

**Response (Duplicate - 409):**
```json
{
  "type": "error",
  "message": "Course with this ID already exists"
}
```

---

## Safeguards Summary

| Safeguard | Implementation | Purpose |
|-----------|----------------|---------|
| **Rate Limiting** | 200 calls/day tracked in DB | Prevent API quota exhaustion |
| **Tee Validation** | Reject "Combo" and "/" tees | Ensure data quality |
| **Duplicate Check** | Course ID uniqueness constraint | Prevent duplicate courses |
| **Authentication** | NextAuth required for all endpoints | Prevent abuse |
| **User Feedback** | Clear error messages | Guide users on what went wrong |
| **Atomic Transactions** | Sequential course/tee/hole creation | Maintain data integrity |

---

## Benefits

### For Users
- ✅ **Immediate Access:** Add courses as needed without waiting for admins
- ✅ **Simple Interface:** No technical knowledge required
- ✅ **Clear Feedback:** Always know what's happening and why
- ✅ **Quality Control:** Bad data automatically filtered out

### For GolfIQ
- ✅ **Rapid Growth:** Course library expands organically with user activity
- ✅ **Reduced Admin Load:** No manual course imports needed
- ✅ **Cost Control:** Rate limiting prevents API overage fees
- ✅ **Data Quality:** Validation ensures only good tees are imported

---

## Usage Statistics

To monitor API usage, query the `api_usage_logs` table:

```sql
-- Daily usage
SELECT
  DATE(created_date) as date,
  COUNT(*) as api_calls
FROM api_usage_logs
WHERE endpoint = 'golf-course-api-search'
GROUP BY DATE(created_date)
ORDER BY date DESC;

-- Hourly usage today
SELECT
  EXTRACT(HOUR FROM created_date) as hour,
  COUNT(*) as api_calls
FROM api_usage_logs
WHERE endpoint = 'golf-course-api-search'
  AND DATE(created_date) = CURRENT_DATE
GROUP BY EXTRACT(HOUR FROM created_date)
ORDER BY hour;

-- Most active users
SELECT
  user_id,
  COUNT(*) as searches
FROM api_usage_logs
WHERE endpoint = 'golf-course-api-search'
  AND created_date >= NOW() - INTERVAL '7 days'
GROUP BY user_id
ORDER BY searches DESC
LIMIT 10;
```

---

## Future Enhancements

### Phase 2 Considerations
- [ ] Per-user cooldown (e.g., max 10 searches per hour per user)
- [ ] Course approval queue for admin review before going live
- [ ] Reputation system (users who add quality courses get higher limits)
- [ ] Analytics dashboard showing daily API usage trends
- [ ] Email notifications when approaching daily limit
- [ ] Automatic course updates (sync with API for rating changes)

---

## Testing Checklist

- [x] Search for existing course in database (should not hit API)
- [x] Search for non-existent course (should hit API and log usage)
- [x] Attempt to add course after hitting 200 call limit (should return 429)
- [x] Add course with "Combo" tees (should skip combo tees)
- [x] Add course with "/" tees (should skip those tees)
- [x] Add course that already exists (should return 409)
- [x] Add course successfully (should redirect to courses page)
- [x] Verify rejectedTees message shows skipped tees
- [x] Verify navigation from courses page works
- [x] Verify TypeScript compilation succeeds
- [x] Verify Prisma schema migration succeeds

---

## Conclusion

The Crowdsourced Course Import system successfully balances user empowerment with data quality and cost control. By implementing smart rate limiting, validation rules, and a user-friendly interface, GolfIQ can rapidly expand its course library while maintaining high data standards.

**Ready for production use!** 🎉
