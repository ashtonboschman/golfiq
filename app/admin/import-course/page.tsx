'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import ManualCourseForm from '@/components/ManualCourseForm';
import { AdminPanelSkeleton } from '@/components/skeleton/PageSkeletons';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import { isAdminUserId } from '@/lib/admin';
import { GOLF_COURSE_API_PROVIDER } from '@/lib/courses/externalIds';
import {
  buildGolfCourseTeeSelections,
  getGolfCourseTeeCount,
  getGolfCourseTees,
} from '@/lib/courses/golfCourseApi';

function formatNineRating(tee: any, segment: 'front' | 'back') {
  const rating = tee[`${segment}_course_rating`];
  const slope = tee[`${segment}_slope_rating`];

  return rating != null && slope != null
    ? `${segment === 'front' ? 'Front 9' : 'Back 9'}: ${rating}/${slope}`
    : null;
}

function formatTeePreviewText(tee: any) {
  const segmentRatings = [
    formatNineRating(tee, 'front'),
    formatNineRating(tee, 'back'),
  ].filter(Boolean);

  return segmentRatings.length > 0
    ? ` - ${segmentRatings.join(', ')}`
    : '';
}

export default function ImportCoursePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { showMessage, clearMessage } = useMessage();

  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [courseDetailLoadingId, setCourseDetailLoadingId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTees, setSelectedTees] = useState<{[key: string]: boolean}>({});
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const trackApiFailure = (properties: Record<string, unknown>) => {
    captureClientEvent(
      ANALYTICS_EVENTS.apiRequestFailed,
      properties,
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  };

  useEffect(() => {
    if (status === 'loading') return;

    const userId = session?.user?.id;
    if (!isAdminUserId(userId)) {
      router.push('/');
      return;
    }

    setAuthChecked(true);
  }, [status, session, router]);

  const handlePreview = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setPreview(parsed);

      setSelectedTees(buildGolfCourseTeeSelections(parsed));

      showMessage('JSON parsed successfully! Review the preview below.', 'success');
    } catch (err: any) {
      showMessage('Invalid JSON: ' + err.message, 'error');
      setPreview(null);
    }
  };

  const handleImport = async () => {
    if (!preview) {
      showMessage('Please preview the JSON first', 'error');
      return;
    }

    // Filter tees based on selection
    const filteredPreview = { ...preview };
    const hasExplicitExternalIdentity = typeof filteredPreview.external_id === 'string';
    const rawExternalId = hasExplicitExternalIdentity
      ? filteredPreview.external_id
      : filteredPreview.id;

    if (rawExternalId !== undefined && rawExternalId !== null) {
      const externalId = String(rawExternalId).trim();
      if (!externalId) {
        showMessage('The provider course ID cannot be empty', 'error');
        return;
      }

      filteredPreview.provider = hasExplicitExternalIdentity
        ? filteredPreview.provider
        : GOLF_COURSE_API_PROVIDER;
      filteredPreview.external_id = externalId;
      delete filteredPreview.id;
    }
    const selectedMaleTees: any[] = [];
    const selectedFemaleTees: any[] = [];

    getGolfCourseTees(preview, 'male').forEach((tee: any, idx: number) => {
      if (selectedTees[`male-${idx}`]) {
        selectedMaleTees.push(tee);
      }
    });

    getGolfCourseTees(preview, 'female').forEach((tee: any, idx: number) => {
      if (selectedTees[`female-${idx}`]) {
        selectedFemaleTees.push(tee);
      }
    });

    // Check if at least one tee is selected
    if (selectedMaleTees.length === 0 && selectedFemaleTees.length === 0) {
      showMessage('Please select at least one tee to import', 'error');
      return;
    }

    filteredPreview.tees = {
      male: selectedMaleTees,
      female: selectedFemaleTees,
    };

    setLoading(true);
    clearMessage();
    let capturedFailure = false;

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filteredPreview),
      });

      const data = await res.json();

      if (!res.ok) {
        trackApiFailure({
          endpoint: '/api/courses',
          method: 'POST',
          status_code: res.status,
          feature_area: 'admin_import_course',
        });
        capturedFailure = true;
        throw new Error(data.message || 'Failed to import course');
      }

      showMessage(data.message || 'Course imported successfully!', 'success');

      // Admin users (ID = 1) stay on page and keep search results
      // Regular users get redirected immediately
      if (isAdminUserId(session?.user?.id)) {
        // Clear form but keep search results for batch importing
        setJsonInput('');
        setPreview(null);
        setSelectedTees({});
      } else {
        // Regular users: redirect immediately to courses page
        router.push('/courses');
      }
    } catch (err: any) {
      if (!capturedFailure) {
        trackApiFailure({
          endpoint: '/api/courses',
          method: 'POST',
          status_code: 0,
          feature_area: 'admin_import_course',
          error_code: 'network_exception',
        });
      }
      showMessage(err.message || 'Failed to import course', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setJsonInput('');
    setPreview(null);
    setSelectedTees({});
    clearMessage();
  };

  const handleToggleTee = (key: string) => {
    setSelectedTees(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectAllTees = () => {
    setSelectedTees(buildGolfCourseTeeSelections(preview));
  };

  const handleDeselectAllTees = () => {
    setSelectedTees({});
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      showMessage('Please enter a search query', 'error');
      return;
    }

    setSearchLoading(true);
    setSearchResults([]);
    clearMessage();
    let capturedFailure = false;

    try {
      const res = await fetch(`/api/golf-course-api/search?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (!res.ok) {
        trackApiFailure({
          endpoint: '/api/golf-course-api/search',
          method: 'GET',
          status_code: res.status,
          feature_area: 'admin_import_course',
        });
        capturedFailure = true;
        throw new Error(data.error || 'Failed to search courses');
      }

      if (data.courses && data.courses.length > 0) {
        setSearchResults(data.courses);
        showMessage(`Found ${data.courses.length} course(s)`, 'success');
      } else {
        setSearchResults([]);
        showMessage('No courses found. Try a different search term.', 'error');
      }
    } catch (err: any) {
      if (!capturedFailure) {
        trackApiFailure({
          endpoint: '/api/golf-course-api/search',
          method: 'GET',
          status_code: 0,
          feature_area: 'admin_import_course',
          error_code: 'network_exception',
        });
      }
      showMessage(err.message || 'Failed to search courses', 'error');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectCourse = async (course: any) => {
    const courseId = String(course?.id ?? '').trim();
    if (!courseId || courseDetailLoadingId) return;

    setCourseDetailLoadingId(courseId);
    clearMessage();

    try {
      const res = await fetch(`/api/golf-course-api/courses/${encodeURIComponent(courseId)}`);
      const data = await res.json();

      if (!res.ok) {
        trackApiFailure({
          endpoint: '/api/golf-course-api/courses/[id]',
          method: 'GET',
          status_code: res.status,
          feature_area: 'admin_import_course',
        });
        throw new Error(data.error || 'Failed to load course details');
      }

      const detailedCourse = data.course;
      setJsonInput(JSON.stringify(detailedCourse, null, 2));
      setPreview(detailedCourse);
      setSelectedTees(buildGolfCourseTeeSelections(detailedCourse));
      setSearchResults([]);
      setSearchQuery('');
      showMessage('Course selected! Review the preview and select tees to import.', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Failed to load course details', 'error');
    } finally {
      setCourseDetailLoadingId(null);
    }
  };

  if (status === 'loading' || !authChecked) {
    return <AdminPanelSkeleton />;
  }

  return (
    <div className="page-stack">
      <div className="card">
        <h2>Search Golf Courses</h2>
        <p className='secondary-text'>
          Search for a course by name or city using the Golf Course API
        </p>

        <div className="admin-course-search-actions">
          <input
            type="text"
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            onKeyPress={(e: any) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter course name or city (e.g., 'Macgregor' or 'Cary')"
            className="form-input"
            disabled={searchLoading}
          />
          <button
            type="button"
            onClick={handleSearch}
            className="btn btn-save u-minw-120"
            disabled={searchLoading || !searchQuery.trim()}
          >
            {searchLoading ? 'Searching...' : 'Search API'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div>
            <h3>Search Results ({searchResults.length})</h3>
            <div className="admin-course-search-results">
              {searchResults.map((course: any) => (
                <div
                  key={course.id}
                  className="card admin-course-search-card"
                  onClick={() => void handleSelectCourse(course)}
                >
                  <div className="u-font-bold u-fs-11 u-color-primary">{course.course_name}</div>
                  <div className="u-color-secondary u-fs-09">{course.club_name}</div>
                  {course.location && (
                    <div className="u-color-secondary u-fs-085">
                      {course.location.city && `${course.location.city}, `}
                      {course.location.state && `${course.location.state}, `}
                      {course.location.country}
                    </div>
                  )}
                  <div className="admin-course-search-meta u-fs-085">
                    {getGolfCourseTeeCount(course, 'male')} male tees, {getGolfCourseTeeCount(course, 'female')} female tees
                    {courseDetailLoadingId === String(course.id) ? ' · Loading details...' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="u-flex u-space-between u-items-center">
          <h2 >Manual Course Entry</h2>
          <button
            type="button"
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="btn btn-toggle u-p-10"
          >
            {showManualEntry ? 'Hide Form' : 'Show Form'}
          </button>
        </div>
        <p className='secondary-text'>
          Create a course manually if it's not available in the Golf Course API
        </p>

        {showManualEntry && (
          <ManualCourseForm
            onCourseCreated={(courseData: any) => {
              setJsonInput(JSON.stringify(courseData, null, 2));
              setPreview(courseData);

              setSelectedTees(buildGolfCourseTeeSelections(courseData));

              setShowManualEntry(false);
              showMessage('Manual course created! Review the preview and click Import when ready.', 'success');
            }}
            onCancel={() => setShowManualEntry(false)}
          />
        )}
      </div>

      <div className="card">
        <h2>Or Paste JSON Manually</h2>
        <p className='secondary-text'>
          Alternatively, paste the JSON response from GolfCourseAPI.com below
        </p>

        <label className="form-label">JSON Response</label>
        <textarea
          value={jsonInput}
          onChange={(e: any) => setJsonInput(e.target.value)}
          placeholder='Paste GolfCourseAPI.com JSON here...'
          rows={15}
          className="form-input u-textarea-code"
        />

        <div className="form-actions">
          <button
            type="button"
            onClick={handleClear}
            className="btn btn-cancel"
            disabled={loading}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handlePreview}
            className="btn btn-toggle"
            disabled={loading || !jsonInput.trim()}
          >
            Preview JSON
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="btn btn-save"
            disabled={loading || !preview}
          >
            {loading ? 'Importing...' : 'Import Course'}
          </button>
        </div>
      </div>

      {preview && (
        <div className="card">
          <h3>Course Preview</h3>

          <div className='secondary-text'>
            <strong>Course Name:</strong> {preview.course_name || 'N/A'}
          </div>

          <div className='secondary-text'>
            <strong>Club Name:</strong> {preview.club_name || 'N/A'}
          </div>

          <div className='secondary-text'>
            <strong>External Course ID:</strong>{' '}
            {preview.external_id || preview.id || 'Generated for manual course'}
          </div>

          {preview.location && (
            <div className='secondary-text'>
              <strong>Location:</strong> {preview.location.city}, {preview.location.state},{' '}
              {preview.location.country}
            </div>
          )}

          {preview.tees && (
            <>
              <div className="admin-course-section-header">
                <strong>Select Tees to Import:</strong>
                <div className="admin-course-inline-actions">
                  <button
                    type="button"
                    onClick={handleSelectAllTees}
                    className="btn btn-toggle u-px-12-py-6 u-fs-085"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllTees}
                    className="btn btn-cancel u-px-12-py-6 u-fs-085"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {getGolfCourseTees(preview, 'male').length > 0 && (
                <div className="admin-course-tee-group">
                  <em className="u-font-bold admin-course-tee-label is-male">Male Tees ({getGolfCourseTees(preview, 'male').length}):</em>
                  <div className="admin-course-tee-list">
                    {getGolfCourseTees(preview, 'male').map((tee: any, idx: number) => (
                      <label
                        key={idx}
                        className={`admin-course-tee-item ${selectedTees[`male-${idx}`] ? 'is-selected-male' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTees[`male-${idx}`] || false}
                          onChange={() => handleToggleTee(`male-${idx}`)}
                          className="admin-course-tee-checkbox"
                        />
                        <span className="admin-course-tee-text">
                          <strong>{tee.tee_name}</strong> - {tee.total_yards} yd (Rating: {tee.course_rating}
                          /Slope: {tee.slope_rating}) - {tee.number_of_holes} holes{formatTeePreviewText(tee)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {getGolfCourseTees(preview, 'female').length > 0 && (
                <div className="admin-course-tee-group">
                  <em className="u-font-bold admin-course-tee-label is-female">Female Tees ({getGolfCourseTees(preview, 'female').length}):</em>
                  <div className="admin-course-tee-list">
                    {getGolfCourseTees(preview, 'female').map((tee: any, idx: number) => (
                      <label
                        key={idx}
                        className={`admin-course-tee-item ${selectedTees[`female-${idx}`] ? 'is-selected-female' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTees[`female-${idx}`] || false}
                          onChange={() => handleToggleTee(`female-${idx}`)}
                          className="admin-course-tee-checkbox"
                        />
                        <span className="admin-course-tee-text">
                          <strong>{tee.tee_name}</strong> - {tee.total_yards} yd (Rating: {tee.course_rating}
                          /Slope: {tee.slope_rating}) - {tee.number_of_holes} holes{formatTeePreviewText(tee)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="admin-course-summary-box">
            <strong className='secondary-text'>Selected Tees Summary:</strong>
            <div className="admin-course-summary-copy">
              {(() => {
                let selectedMaleCount = 0;
                let selectedFemaleCount = 0;
                let selectedMaleHoles = 0;
                let selectedFemaleHoles = 0;

                getGolfCourseTees(preview, 'male').forEach((tee: any, idx: number) => {
                  if (selectedTees[`male-${idx}`]) {
                    selectedMaleCount++;
                    selectedMaleHoles += tee.holes?.length || 0;
                  }
                });

                getGolfCourseTees(preview, 'female').forEach((tee: any, idx: number) => {
                  if (selectedTees[`female-${idx}`]) {
                    selectedFemaleCount++;
                    selectedFemaleHoles += tee.holes?.length || 0;
                  }
                });

                return (
                  <>
                    <div><strong>Selected:</strong> {selectedMaleCount} male tees, {selectedFemaleCount} female tees</div>
                    <div><strong>Total Holes:</strong> {selectedMaleHoles} male holes, {selectedFemaleHoles} female holes</div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Instructions</h3>
        <div className="u-mb-16">
          <strong className='form-label'>Option 1: Use the Search Feature (Recommended)</strong>
          <ol className='secondary-text'>
            <li>Enter a course name or city in the search box above</li>
            <li>Click "Search API" to find courses</li>
            <li>Click on a course from the search results to select it</li>
            <li>Uncheck any tees you don't want to import</li>
            <li>Click "Import Course" to save to database</li>
          </ol>
        </div>

        <div className="u-mb-16">
          <strong className='form-label'>Option 2: Manual Course Entry</strong>
          <ol className='secondary-text'>
            <li>Click "Show Form" in the Manual Course Entry section</li>
            <li>Fill in course name, club name, and location details</li>
            <li>Add tee boxes one at a time with ratings and hole details</li>
            <li>Click "Create Course Preview" when all tees are added</li>
            <li>Review the preview and click "Import Course"</li>
          </ol>
        </div>

        <div>
          <strong className='form-label'>Option 3: Paste JSON Manually</strong>
          <ol className='secondary-text'>
            <li>Go to <a href="https://golfcourseapi.com" target="_blank" rel="noopener noreferrer" className="u-link-blue">golfcourseapi.com</a></li>
            <li>Search for a course and get the detailed JSON response</li>
            <li>Copy the entire JSON response</li>
            <li>Paste it into the "Or Paste JSON Manually" text area</li>
            <li>Click "Preview JSON" to validate the data</li>
            <li>Review the preview and click "Import Course"</li>
          </ol>
        </div>

        <div className="u-note-box-warning">
          <strong>Note:</strong> Each search and selected course detail uses an API call. GolfCourseAPI.com currently allows 50 free calls per day.
        </div>
      </div>

      <div className="card">
        <h3>Example JSON Structure</h3>
        <pre className="u-pre-code-block">
          {`{
            "id": "7k2m9qb4",
            "club_name": "Example Golf Club",
            "course_name": "Championship Course",
            "location": {
              "address": "123 Golf St",
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
                  "front_course_rating": 36.2,
                  "front_slope_rating": 134,
                  "back_course_rating": 36.3,
                  "back_slope_rating": 136,
                  "total_yards": 6800,
                  "number_of_holes": 18,
                  "par_total": 72,
                  "holes": [
                    { "par": 4, "yardage": 380, "handicap": 1 },
                    ...
                  ]
                }
              ],
              "female": [ ... ]
            }
          }`}
        </pre>
      </div>
    </div>
  );
}


