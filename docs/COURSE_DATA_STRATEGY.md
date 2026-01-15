# Golf Course Data Strategy

## Problem
- GolfCourseAPI.com missing Manitoba courses
- Limited to 200 API calls/day
- Course data rarely changes
- Need reliable, fast course data

## Recommended Solution: Hybrid Approach

### Phase 1: Seed Database (One-time)

**Option A: Use GolfCourseAPI.com**
```javascript
// Create admin endpoint: /api/admin/seed-courses
// Use your 200 daily calls to seed courses gradually
// Store in Supabase permanently
```

**Option B: OpenStreetMap (FREE, unlimited)**
```javascript
// Query Overpass API for Manitoba golf courses
const query = `
  [out:json];
  area["name"="Manitoba"]->.searchArea;
  (
    node["leisure"="golf_course"](area.searchArea);
    way["leisure"="golf_course"](area.searchArea);
    relation["leisure"="golf_course"](area.searchArea);
  );
  out center;
`;
// Returns: name, location, website, phone
// Then enrich with your own data
```

**Option C: Manual Entry Tool**
```javascript
// Create admin form to add courses manually
// You or users can add missing Manitoba courses
// Include: name, location, tees, holes, pars, yardages
```

### Phase 2: Database Storage

**Your current schema is perfect:**
- courses (name, location, club_name)
- tees (rating, slope, yardage per tee)
- holes (par, yardage, handicap per hole)

**Benefits:**
- ✅ No API calls needed for users
- ✅ Fast queries (local DB)
- ✅ No rate limits
- ✅ Complete control over data
- ✅ Can add Manitoba courses yourself

### Phase 3: User Contributions (Future)

Allow users to:
1. Submit missing courses
2. Update incorrect data
3. Add new tees/holes
4. Verify course information

### Phase 4: Periodic Sync (Optional)

Use your 200/day GolfCourseAPI calls to:
- Update existing course data (ratings, slope)
- Add newly opened courses
- Run weekly/monthly background job

## Implementation Plan

### Step 1: Create Admin Seeding Tool
```typescript
// app/admin/seed-courses/page.tsx
// Form to paste GolfCourseAPI.com JSON response
// Parses and inserts into Supabase
```

### Step 2: Add Manual Course Entry
```typescript
// app/admin/add-course/page.tsx
// Form for adding Manitoba courses manually
// Include all tees, holes, pars, yardages
```

### Step 3: OpenStreetMap Integration (Optional)
```typescript
// Find Manitoba courses from OSM
// Cross-reference with your DB
// Flag missing courses for manual entry
```

## Manitoba-Specific Solution

### Popular Manitoba Courses to Add Manually:
Research suggests these are major Manitoba courses:
- Breezy Bend Country Club (Headingley)
- Southwood Golf & Country Club (Winnipeg)
- Pine Ridge Golf Club (Winnipeg)
- Elmhurst Golf & Country Club (Winnipeg)
- Transcona Golf Club (Winnipeg)
- St. Charles Country Club (Winnipeg)
- Niakwa Country Club (Winnipeg)
- Clear Lake Golf Course (Wasagaming)
- Thompson Golf & Country Club (Thompson)
- Brandon Golf & Country Club (Brandon)

### Data Collection Strategy:
1. Call each course directly
2. Ask for scorecard (PDF/email)
3. Manually enter into your DB via admin tool
4. Takes ~30 mins per course
5. One-time effort for permanent data

## Cost Comparison

### GolfCourseAPI.com Only:
- Free tier: 200 calls/day
- If storing: One-time cost (call once per course)
- If NOT storing: Hit rate limits quickly

### Hybrid (Recommended):
- Use 200 calls to seed popular courses
- Manually add Manitoba courses (free)
- OpenStreetMap for discovery (free)
- **Total cost: $0/month**

### Paid Alternative:
- GolfCourseAPI.com paid tier: $29-99/month
- Only worth it if you need continuous updates
- **Not recommended** since course data is static

## Recommended Next Steps

1. **Keep GolfCourseAPI.com** for bulk seeding
2. **Create admin tool** to paste API responses into DB
3. **Manually add** 10-15 major Manitoba courses
4. **User testing** to identify missing courses
5. **Crowdsource** - let users submit courses

## Example Admin Tool Flow

```
Admin Panel → Seed Courses
├─ Option 1: Paste GolfCourseAPI.com JSON
│   └─ Parses and saves to DB
├─ Option 2: Manual Entry Form
│   ├─ Course details
│   ├─ Add tees (multiple)
│   └─ Add holes (9 or 18)
└─ Option 3: OSM Import
    └─ Discovers courses by location
```

## Conclusion

**Best approach for your app:**
1. ✅ Store ALL courses in Supabase (you already have schema)
2. ✅ Use GolfCourseAPI.com to seed ~200 popular courses
3. ✅ Manually add Manitoba courses (10-15 courses = 5 hours work)
4. ✅ No ongoing API costs
5. ✅ Fast, reliable, no rate limits
6. ✅ Future: Allow user submissions

This gives you complete control, no costs, and better Manitoba coverage than any API.
