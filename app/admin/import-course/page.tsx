'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import ManualCourseForm from '@/components/ManualCourseForm';
import { AdminPanelSkeleton } from '@/components/skeleton/PageSkeletons';

export default function ImportCoursePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showMessage, clearMessage } = useMessage();

  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTees, setSelectedTees] = useState<{[key: string]: boolean}>({});
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    const userId = session?.user?.id;
    if (userId !== '1') {
      router.push('/');
      return;
    }

    setAuthChecked(true);
  }, [status, session, router]);

  const handlePreview = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setPreview(parsed);

      // Initialize all tees as selected by default
      const teeSelections: {[key: string]: boolean} = {};
      if (parsed.tees?.male) {
        parsed.tees.male.forEach((tee: any, idx: number) => {
          teeSelections[`male-${idx}`] = true;
        });
      }
      if (parsed.tees?.female) {
        parsed.tees.female.forEach((tee: any, idx: number) => {
          teeSelections[`female-${idx}`] = true;
        });
      }
      setSelectedTees(teeSelections);

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
    const selectedMaleTees: any[] = [];
    const selectedFemaleTees: any[] = [];

    if (preview.tees?.male) {
      preview.tees.male.forEach((tee: any, idx: number) => {
        if (selectedTees[`male-${idx}`]) {
          selectedMaleTees.push(tee);
        }
      });
    }

    if (preview.tees?.female) {
      preview.tees.female.forEach((tee: any, idx: number) => {
        if (selectedTees[`female-${idx}`]) {
          selectedFemaleTees.push(tee);
        }
      });
    }

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
        throw new Error(data.message || 'Failed to import course');
      }

      showMessage(data.message || 'Course imported successfully!', 'success');

      // Admin users (ID = 1) stay on page and keep search results
      // Regular users get redirected immediately
      if (session?.user?.id === '1') {
        // Clear form but keep search results for batch importing
        setJsonInput('');
        setPreview(null);
        setSelectedTees({});
      } else {
        // Regular users: redirect immediately to courses page
        router.push('/courses');
      }
    } catch (err: any) {
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
    const allSelected: {[key: string]: boolean} = {};
    if (preview?.tees?.male) {
      preview.tees.male.forEach((_: any, idx: number) => {
        allSelected[`male-${idx}`] = true;
      });
    }
    if (preview?.tees?.female) {
      preview.tees.female.forEach((_: any, idx: number) => {
        allSelected[`female-${idx}`] = true;
      });
    }
    setSelectedTees(allSelected);
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

    try {
      const res = await fetch(`/api/golf-course-api/search?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (!res.ok) {
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
      showMessage(err.message || 'Failed to search courses', 'error');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectCourse = (course: any) => {
    setJsonInput(JSON.stringify(course, null, 2));
    setPreview(course);

    // Initialize all tees as selected by default
    const teeSelections: {[key: string]: boolean} = {};
    if (course.tees?.male) {
      course.tees.male.forEach((_: any, idx: number) => {
        teeSelections[`male-${idx}`] = true;
      });
    }
    if (course.tees?.female) {
      course.tees.female.forEach((_: any, idx: number) => {
        teeSelections[`female-${idx}`] = true;
      });
    }
    setSelectedTees(teeSelections);

    setSearchResults([]);
    setSearchQuery('');
    showMessage('Course selected! Review the preview and select tees to import.', 'success');
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

        <div style={{ display: 'flex', gap: '10px' }}>
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
            className="btn btn-save"
            disabled={searchLoading || !searchQuery.trim()}
            style={{ minWidth: '120px' }}
          >
            {searchLoading ? 'Searching...' : 'Search API'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div>
            <h3>Search Results ({searchResults.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.map((course: any) => (
                <div
                  key={course.id}
                  className="card"
                  style={{
                    backgroundColor: '#1E242F',
                    cursor: 'pointer',
                    border: '1px solid #2A313D',
                    padding: '10px',
                    transition: 'background-color 0.2s',
                  }}
                  onClick={() => handleSelectCourse(course)}
                  onMouseEnter={(e: any) => (e.currentTarget.style.backgroundColor = '#2A313D')}
                  onMouseLeave={(e: any) => (e.currentTarget.style.backgroundColor = '#1E242F')}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color:'#EDEFF2' }}>{course.course_name}</div>
                  <div style={{ color: '#9AA3B2', fontSize: '0.9rem' }}>{course.club_name}</div>
                  {course.location && (
                    <div style={{ color: '#9AA3B2', fontSize: '0.85rem' }}>
                      {course.location.city && `${course.location.city}, `}
                      {course.location.state && `${course.location.state}, `}
                      {course.location.country}
                    </div>
                  )}
                  <div style={{ color: '#3498db', fontSize: '0.85rem' }}>
                    {course.tees?.male?.length || 0} male tees, {course.tees?.female?.length || 0} female tees
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 >Manual Course Entry</h2>
          <button
            type="button"
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="btn btn-toggle"
            style={{ width: 'auto', padding: '10px' }}
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

              // Initialize all tees as selected by default
              const teeSelections: {[key: string]: boolean} = {};
              if (courseData.tees?.male) {
                courseData.tees.male.forEach((_: any, idx: number) => {
                  teeSelections[`male-${idx}`] = true;
                });
              }
              if (courseData.tees?.female) {
                courseData.tees.female.forEach((_: any, idx: number) => {
                  teeSelections[`female-${idx}`] = true;
                });
              }
              setSelectedTees(teeSelections);

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
          className="form-input"
          style={{ fontFamily: 'monospace', fontSize: '12px' }}
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
            <strong>Course ID:</strong> {preview.id || 'N/A'}
          </div>

          {preview.location && (
            <div className='secondary-text'>
              <strong>Location:</strong> {preview.location.city}, {preview.location.state},{' '}
              {preview.location.country}
            </div>
          )}

          {preview.tees && (
            <>
              <div style={{ marginTop: '24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#EDEFF2' }}>
                <strong>Select Tees to Import:</strong>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSelectAllTees}
                    className="btn btn-toggle"
                    style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto' }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllTees}
                    className="btn btn-cancel"
                    style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto' }}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {preview.tees.male && preview.tees.male.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <em style={{ fontWeight: 'bold', color: '#3498db' }}>Male Tees ({preview.tees.male.length}):</em>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {preview.tees.male.map((tee: any, idx: number) => (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px',
                          backgroundColor: '#1E242F',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: selectedTees[`male-${idx}`] ? '2px solid #2196f3' : '1px solid #2A313D',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTees[`male-${idx}`] || false}
                          onChange={() => handleToggleTee(`male-${idx}`)}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                        />
                        <span style={{ flex: 1, color: '#9AA3B2' }}>
                          <strong>{tee.tee_name}</strong> - {tee.total_yards} yds (Rating: {tee.course_rating}
                          /Slope: {tee.slope_rating}) - {tee.number_of_holes} holes
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {preview.tees.female && preview.tees.female.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <em style={{ fontWeight: 'bold', color: '#e74c3c' }}>Female Tees ({preview.tees.female.length}):</em>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {preview.tees.female.map((tee: any, idx: number) => (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px',
                          backgroundColor: '#1E242F',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: selectedTees[`female-${idx}`] ? '2px solid #e91e63' : '1px solid #2A313D',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTees[`female-${idx}`] || false}
                          onChange={() => handleToggleTee(`female-${idx}`)}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                        />
                        <span style={{ flex: 1, color: '#9AA3B2' }}>
                          <strong>{tee.tee_name}</strong> - {tee.total_yards} yds (Rating: {tee.course_rating}
                          /Slope: {tee.slope_rating}) - {tee.number_of_holes} holes
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: '24px', padding: '12px', background: '#1E242F', borderRadius: '4px' }}>
            <strong className='secondary-text'>Selected Tees Summary:</strong>
            <div style={{ fontSize: '14px', marginTop: '8px', color: '#9AA3B2' }}>
              {(() => {
                let selectedMaleCount = 0;
                let selectedFemaleCount = 0;
                let selectedMaleHoles = 0;
                let selectedFemaleHoles = 0;

                preview.tees?.male?.forEach((tee: any, idx: number) => {
                  if (selectedTees[`male-${idx}`]) {
                    selectedMaleCount++;
                    selectedMaleHoles += tee.holes?.length || 0;
                  }
                });

                preview.tees?.female?.forEach((tee: any, idx: number) => {
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
        <div style={{ marginBottom: '16px' }}>
          <strong className='form-label'>Option 1: Use the Search Feature (Recommended)</strong>
          <ol className='secondary-text'>
            <li>Enter a course name or city in the search box above</li>
            <li>Click "Search API" to find courses</li>
            <li>Click on a course from the search results to select it</li>
            <li>Uncheck any tees you don't want to import</li>
            <li>Click "Import Course" to save to database</li>
          </ol>
        </div>

        <div style={{ marginBottom: '16px' }}>
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
            <li>Go to <a href="https://golfcourseapi.com" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>golfcourseapi.com</a></li>
            <li>Search for a course and get the detailed JSON response</li>
            <li>Copy the entire JSON response</li>
            <li>Paste it into the "Or Paste JSON Manually" text area</li>
            <li>Click "Preview JSON" to validate the data</li>
            <li>Review the preview and click "Import Course"</li>
          </ol>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
          <strong>Note:</strong> Each API search uses one of your daily API calls. You have 200 free calls per day with GolfCourseAPI.com.
        </div>
      </div>

      <div className="card">
        <h3>Example JSON Structure</h3>
        <pre style={{ background: '#171C26', padding: '12px', borderRadius: '4px', overflow: 'auto', fontSize: '12px', color: '#9AA3B2' }}>
          {`{
            "id": 123456,
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
