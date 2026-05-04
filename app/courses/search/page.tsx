'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import { CoursesSearchSkeleton } from '@/components/skeleton/PageSkeletons';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';

export default function CourseSearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { showMessage, clearMessage } = useMessage();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastSearchOutcome, setLastSearchOutcome] = useState<'idle' | 'success_with_results' | 'success_no_results' | 'error'>('idle');
  const [importingCourseId, setImportingCourseId] = useState<number | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestForm, setRequestForm] = useState({
    courseName: '',
    city: '',
    province: '',
    country: '',
    notes: '',
  });

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
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  if (status === 'loading') return <CoursesSearchSkeleton />;
  if (status === 'unauthenticated') {
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

    const queryText = searchQuery.trim();
    setSearchLoading(true);
    setSearchResults([]);
    setLastSearchOutcome('idle');
    setRequestError('');
    setRequestForm((prev) => ({
      ...prev,
      courseName: queryText,
    }));
    clearMessage();
    let capturedFailure = false;

    try {
      const res = await fetch(`/api/golf-course-api/search?query=${encodeURIComponent(queryText)}`);
      const data = await res.json();

      if (!res.ok) {
        trackApiFailure({
          endpoint: '/api/golf-course-api/search',
          method: 'GET',
          status_code: res.status,
          feature_area: 'courses_search',
        });
        capturedFailure = true;
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
          setLastSearchOutcome('success_with_results');
        } else {
          setSearchResults([]);
          setLastSearchOutcome('success_no_results');
        }
      } else {
        setSearchResults([]);
        setLastSearchOutcome('success_no_results');
      }
    } catch (err: any) {
      if (!capturedFailure) {
        trackApiFailure({
          endpoint: '/api/golf-course-api/search',
          method: 'GET',
          status_code: 0,
          feature_area: 'courses_search',
          error_code: 'network_exception',
        });
      }
      showMessage(err.message || 'Failed to search courses', 'error');
      setSearchResults([]);
      setLastSearchOutcome('error');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRequestCourse = async () => {
    if (!requestForm.courseName.trim()) {
      setRequestError('Course name is required.');
      return;
    }

    setRequestSubmitting(true);
    setRequestError('');

    try {
      const res = await fetch('/api/courses/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery.trim() || undefined,
          courseName: requestForm.courseName.trim(),
          city: requestForm.city.trim() || undefined,
          province: requestForm.province.trim() || undefined,
          country: requestForm.country.trim() || undefined,
          notes: requestForm.notes.trim() || undefined,
          source: lastSearchOutcome === 'success_no_results' ? 'global_api_no_result' : 'manual',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to create course request.');
      }

      showMessage("Course request sent. We'll let you know once it's added.", 'success');
      setRequestForm({
        courseName: searchQuery.trim(),
        city: '',
        province: '',
        country: '',
        notes: '',
      });
      setRequestError('');
    } catch (error: any) {
      console.error('Course request submit error:', error);
      setRequestError("We couldn't send the request. Please try again.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleAddCourse = async (course: any) => {
    setImportingCourseId(course.id);
    clearMessage();
    let capturedFailure = false;

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
        trackApiFailure({
          endpoint: '/api/courses',
          method: 'POST',
          status_code: res.status,
          feature_area: 'courses_search',
        });
        capturedFailure = true;
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
      if (!capturedFailure) {
        trackApiFailure({
          endpoint: '/api/courses',
          method: 'POST',
          status_code: 0,
          feature_area: 'courses_search',
          error_code: 'network_exception',
        });
      }
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
            <li>Try the full course name</li>
            <li>You can also search by city</li>
            <li>Can&apos;t find it? Request it below</li>
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
                e.currentTarget.blur();
              }
            }}
            placeholder="Enter course name or city (e.g., 'Pebble Beach' or 'Augusta')"
            className="form-input"
            disabled={searchLoading}
            enterKeyHint="search"
            maxLength={250}
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

        {!searchLoading && (
          <div className="card border-color course-request-fallback-card">
            <h3>Still can't find it?</h3>
            <p className="secondary-text course-request-fallback-copy">
              Send us the course name and city. We&apos;ll review it and add it if scorecard data is available.
            </p>

            <div className="course-request-fallback-fields">
              <input
                type="text"
                className="form-input"
                value={requestForm.courseName}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, courseName: e.target.value }))}
                placeholder="Course name"
                maxLength={255}
                disabled={requestSubmitting}
              />
              <input
                type="text"
                className="form-input"
                value={requestForm.city}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="City"
                maxLength={100}
                disabled={requestSubmitting}
              />
              <input
                type="text"
                className="form-input"
                value={requestForm.province}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, province: e.target.value }))}
                placeholder="Province"
                maxLength={100}
                disabled={requestSubmitting}
              />
              <input
                type="text"
                className="form-input"
                value={requestForm.country}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, country: e.target.value }))}
                placeholder="Country (optional)"
                maxLength={100}
                disabled={requestSubmitting}
              />
              <textarea
                className="form-input"
                value={requestForm.notes}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Notes (optional)"
                maxLength={2000}
                rows={3}
                disabled={requestSubmitting}
              />

              {requestError && (
                <p className="secondary-text" style={{ color: '#b54747', margin: 0 }}>
                  {requestError}
                </p>
              )}

              <button
                type="button"
                className="btn btn-save"
                onClick={handleRequestCourse}
                disabled={requestSubmitting || !requestForm.courseName.trim()}
              >
                {requestSubmitting ? 'Submitting...' : 'Request Course'}
              </button>
            </div>
          </div>
        )}

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
    </div>
  );
}
