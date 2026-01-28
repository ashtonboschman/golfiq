'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';

export default function CourseSearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showMessage, clearMessage } = useMessage();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [importingCourseId, setImportingCourseId] = useState<number | null>(null);

  if (status === 'loading') return <p className="loading-text">Loading...</p>;
  if (status === 'unauthenticated') {
    router.replace('/login');
    return null;
  }

  // Helper to get valid tees grouped by gender (excluding Combo and tees with "/" or "-")
  const getValidTees = (tees: any) => {
    const validTees: { male: string[]; female: string[] } = { male: [], female: [] };

    if (tees?.male) {
      tees.male.forEach((tee: any) => {
        const teeName = tee.tee_name || '';
        if (!teeName.toLowerCase().includes('combo') && !teeName.includes('/') && !teeName.includes('-')) {
          validTees.male.push(teeName);
        }
      });
    }
    if (tees?.female) {
      tees.female.forEach((tee: any) => {
        const teeName = tee.tee_name || '';
        if (!teeName.toLowerCase().includes('combo') && !teeName.includes('/') && !teeName.includes('-')) {
          validTees.female.push(teeName);
        }
      });
    }

    return validTees;
  };

  const getValidTeeCount = (tees: any) => {
    const validTees = getValidTees(tees);
    return validTees.male.length + validTees.female.length;
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
        if (res.status === 429) {
          throw new Error(`API limit reached (${data.callsUsed}/${data.limit} calls used today). Please try again tomorrow.`);
        }
        throw new Error(data.error || 'Failed to search courses');
      }

      if (data.courses && data.courses.length > 0) {
        // Filter out courses with 0 valid tees
        const coursesWithValidTees = data.courses.filter((course: any) => {
          return getValidTeeCount(course.tees) > 0;
        });

        if (coursesWithValidTees.length > 0) {
          setSearchResults(coursesWithValidTees);
        } else {
          setSearchResults([]);
          showMessage('No courses found with valid tees. Try a different search term.', 'error');
        }
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

  const handleAddCourse = async (course: any) => {
    setImportingCourseId(course.id);
    clearMessage();

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(course),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          showMessage('This course already exists in the database!', 'error');
        } else {
          throw new Error(data.message || 'Failed to add course');
        }
      } else {
        showMessage('Course added successfully!', 'success');
        setSearchResults([]);
        setSearchQuery('');
      }
    } catch (err: any) {
      showMessage(err.message || 'Failed to add course', 'error');
    } finally {
      setImportingCourseId(null);
    }
  };

  return (
    <div className="page-stack">
      <div className="card">
        <div style={{ padding: '10px', background: '#e3f2fd', borderRadius: '8px', border: '2px solid #2196f3' }}>
          <strong style={{ color: '#1976d2' }}>Search Tips:</strong>
          <ul style={{ marginLeft: '0', marginTop: '8px', marginBottom: '0', paddingLeft: 20, fontSize: '0.9rem', color: '#555' }}>
            <li>Use complete course names (e.g., "Pebble" not "Peb")</li>
            <li>Try searching by city name if course name doesn't work</li>
            <li>Search requires exact or close matches - partial names may not work</li>
            <li>If not found in API contact support with a photo of scorecard and we will manually ad it!</li>
          </ul>
        </div>

        <div className="search-input-container">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={(e) => {
              const len = e.target.value.length;
              e.target.setSelectionRange(len, len);
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
                e.currentTarget.blur();
              }
            }}
            placeholder="Enter course name or city (e.g., 'Pebble Beach' or 'Augusta')"
            className="form-input"
            disabled={searchLoading}
            enterKeyHint="search"
            max={250}
          />
          <button
            type="button"
            onClick={handleSearch}
            className="btn btn-save"
            disabled={searchLoading || !searchQuery.trim()}
            style={{ minWidth: '120px' }}
          >
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ marginBottom: '12px' }}>Search Results</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {searchResults.map((course) => {
                const validTees = getValidTees(course.tees);

                return (
                  <div
                    key={course.id}
                    className="card border-color"
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }} className='primary-text'>
                      {course.course_name}
                    </div>
                    <div style={{ fontSize: '0.9rem' }} className='secondary-text'>
                      {course.club_name}
                    </div>
                    {course.location && (
                      <div style={{ fontSize: '0.85rem' }} className='secondary-text'>
                        {course.location.city && `${course.location.city}, `}
                        {course.location.state && `${course.location.state}, `}
                        {course.location.country}
                      </div>
                    )}

                    {validTees.male.length > 0 && (
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '0.85rem' }} className='secondary-text'>Male Tees: </span>
                        <span style={{ fontSize: '0.85rem', color: '#3498db' }}>
                          {validTees.male.join(', ')}
                        </span>
                      </div>
                    )}

                    {validTees.female.length > 0 && (
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '0.85rem' }} className='secondary-text'>Female Tees: </span>
                        <span style={{ fontSize: '0.85rem', color: '#e91e63' }}>
                          {validTees.female.join(', ')}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAddCourse(course)}
                      disabled={importingCourseId !== null}
                      className="btn btn-add"
                      style={{ width: '100%' }}
                    >
                      {importingCourseId === course.id ? 'Adding...' : 'Add Course'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>How It Works</h3>
        <ol className='secondary-text'>
          <li>Search for a golf course by name or city</li>
          <li>Click "Add Course" next to the course you want</li>
          <li>All valid tees will be imported automatically</li>
          <li>The course will be available for everyone to use!</li>
        </ol>
        <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '8px', border: '2px solid #ffc107' }}>
          <strong>Note:</strong> All users share a limit of 200 course searches per day. Invalid tees (tees with "Combo", "-", or "/") are automatically excluded.
        </div>
      </div>
    </div>
  );
}
