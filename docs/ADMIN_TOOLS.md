# Admin Tools Documentation

## Course Import Tool

### Access
Navigate to: **http://localhost:3000/admin/import-course**

Or click the **📥 Import** button in the header (top right, next to settings)

### Purpose
Easily import golf courses from GolfCourseAPI.com into your database without using Postman or Thunder Client.

### How to Use

#### Step 1: Get Course Data from GolfCourseAPI.com
1. Go to [https://golfcourseapi.com](https://golfcourseapi.com)
2. Sign in with your API key
3. Search for a course (e.g., "Winnipeg Golf Club")
4. Copy the entire JSON response

#### Step 2: Import into Your Database
1. Open the Import Course page: `/admin/import-course`
2. Paste the JSON into the text area
3. Click **"Preview JSON"** to validate and see a preview
4. Review the course details, tees, and holes count
5. Click **"Import Course"** to save to database
6. Success! You'll be redirected to the courses page

### Features

✅ **JSON Validation** - Ensures valid JSON before importing
✅ **Preview** - See course details before importing
✅ **Error Handling** - Clear error messages if something goes wrong
✅ **Duplicate Detection** - Won't import the same course twice
✅ **Complete Data** - Imports course, location, all tees, and all holes

### Expected JSON Format

The tool expects the same format as GolfCourseAPI.com provides:

```json
{
  "id": 123456,
  "club_name": "Winnipeg Golf Club",
  "course_name": "Championship Course",
  "location": {
    "address": "123 Golf Road",
    "city": "Winnipeg",
    "state": "Manitoba",
    "country": "Canada",
    "latitude": 49.8951,
    "longitude": -97.1384
  },
  "tees": {
    "male": [
      {
        "id": 789,
        "tee_name": "Blue",
        "course_rating": 72.5,
        "slope_rating": 135,
        "bogey_rating": 95.0,
        "total_yards": 6800,
        "total_meters": 6218,
        "number_of_holes": 18,
        "par_total": 72,
        "front_course_rating": 36.2,
        "front_slope_rating": 133,
        "front_bogey_rating": 47.5,
        "back_course_rating": 36.3,
        "back_slope_rating": 137,
        "back_bogey_rating": 47.5,
        "holes": [
          { "par": 4, "yardage": 380, "handicap": 1 },
          { "par": 5, "yardage": 520, "handicap": 5 },
          { "par": 3, "yardage": 185, "handicap": 17 },
          ...
        ]
      }
    ],
    "female": [
      {
        "id": 790,
        "tee_name": "Red",
        "course_rating": 70.0,
        "slope_rating": 125,
        "total_yards": 5400,
        "number_of_holes": 18,
        "par_total": 72,
        "holes": [
          { "par": 4, "yardage": 320, "handicap": 1 },
          ...
        ]
      }
    ]
  }
}
```

### API Endpoint

The import tool uses: **POST /api/courses**

You can also call this endpoint directly with tools like Postman if preferred.

### Common Issues & Solutions

**Issue:** "Course with this ID already exists"
**Solution:** The course is already in your database. To re-import, delete it first.

**Issue:** "Invalid JSON"
**Solution:** Make sure you copied the entire JSON response, including opening `{` and closing `}`

**Issue:** "Course ID, club name, and course name are required"
**Solution:** Ensure the JSON includes `id`, `club_name`, and `course_name` fields

### Rate Limits

- GolfCourseAPI.com Free Tier: **200 calls/day**
- Each course search/retrieval counts as 1 call
- Courses are stored in your database, so you only import once

### Recommendations

1. **Start with local courses** - Import Manitoba courses first
2. **Batch import** - Use your 200 daily calls to import popular courses
3. **Keep track** - Note which courses you've imported to avoid duplicates
4. **Verify data** - Always preview before importing to catch issues

## Manual Course Entry (Future Enhancement)

If GolfCourseAPI.com doesn't have a course, you can manually add it:

### Option 1: Create SQL Insert
```sql
-- Insert course
INSERT INTO courses (id, club_name, course_name)
VALUES (999999, 'My Local Club', 'Main Course');

-- Insert location
INSERT INTO locations (course_id, city, state, country)
VALUES (999999, 'Winnipeg', 'Manitoba', 'Canada');

-- Insert tee
INSERT INTO tees (course_id, gender, tee_name, course_rating, slope_rating, total_yards, number_of_holes, par_total)
VALUES (999999, 'male', 'Blue', 72.0, 130, 6500, 18, 72);

-- Insert holes (repeat for each hole)
INSERT INTO holes (tee_id, hole_number, par, yardage, handicap)
VALUES (1, 1, 4, 380, 5);
```

### Option 2: Manual Entry Form (TODO)
Future enhancement: Create a form-based course entry tool for courses not in GolfCourseAPI.com

## Admin Features Roadmap

### Phase 1 (✅ Complete)
- [x] JSON import tool
- [x] Course preview
- [x] Error handling
- [x] Duplicate detection

### Phase 2 (Future)
- [ ] Manual course entry form
- [ ] Edit existing courses
- [ ] Delete courses
- [ ] Bulk import from CSV
- [ ] Course verification/approval system

### Phase 3 (Future)
- [ ] User-submitted courses
- [ ] Course data review queue
- [ ] Auto-sync with GolfCourseAPI.com
- [ ] Course ratings/reviews

## Testing the Import Tool

### Test Data

Here's a small test course JSON you can use to test the import:

```json
{
  "id": 999999,
  "club_name": "Test Golf Club",
  "course_name": "Test Course",
  "location": {
    "address": "123 Test St",
    "city": "Test City",
    "state": "Test State",
    "country": "Test Country",
    "latitude": 50.0,
    "longitude": -100.0
  },
  "tees": {
    "male": [
      {
        "id": 8888,
        "tee_name": "Blue",
        "course_rating": 72.0,
        "slope_rating": 130,
        "total_yards": 6500,
        "number_of_holes": 9,
        "par_total": 36,
        "holes": [
          { "par": 4, "yardage": 380, "handicap": 1 },
          { "par": 5, "yardage": 520, "handicap": 3 },
          { "par": 3, "yardage": 185, "handicap": 7 },
          { "par": 4, "yardage": 400, "handicap": 2 },
          { "par": 4, "yardage": 360, "handicap": 5 },
          { "par": 3, "yardage": 170, "handicap": 9 },
          { "par": 5, "yardage": 540, "handicap": 4 },
          { "par": 4, "yardage": 390, "handicap": 6 },
          { "par": 4, "yardage": 410, "handicap": 8 }
        ]
      }
    ],
    "female": []
  }
}
```

### Verification Steps

After importing:
1. Go to `/courses` - Verify the course appears
2. Click the course - Verify all tee details are correct
3. Check the scorecard - Verify all holes are present with correct par/yardage
4. Try adding a round - Select the course and tee to ensure it works

## Security Note

⚠️ **Important**: This admin tool has basic authentication (requires login) but does NOT have role-based access control.

**Current behavior:** Any authenticated user can import courses

**Future enhancement:** Add admin role/permission system to restrict access

For now, ensure only trusted users have access to the application.

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify your JSON format matches the expected structure
3. Ensure the course ID is unique
4. Check database connection in Supabase

For GolfCourseAPI.com issues:
- Verify your API key is active
- Check your daily limit (200 calls)
- Ensure the course exists in their database
