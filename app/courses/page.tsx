'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '../providers';
import CourseCard from '@/components/CourseCard';
import InlineAdBanner from '@/components/InlineAdBanner';
import { Plus } from 'lucide-react';

interface Location {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Tee {
  number_of_holes?: number | null;
}

interface Course {
  id: number;
  club_name: string;
  course_name: string;
  location?: Location | null;
  tees?: {
    male?: Tee[];
    female?: Tee[];
  };
  distance?: number; // Distance in km from user's location
}

export default function CoursesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showMessage, clearMessage } = useMessage();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationChecked, setLocationChecked] = useState(false);
  const [waitingForLocation, setWaitingForLocation] = useState(true);

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Request user's geolocation on mount with timeout
  useEffect(() => {
    if (navigator.geolocation) {
      const timeoutId = setTimeout(() => {
        if (!locationChecked) {
          console.log('Location request timed out, proceeding without location');
          setLocationChecked(true);
          setWaitingForLocation(false);
        }
      }, 2000); // 2 second timeout

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocationChecked(true);
          setWaitingForLocation(false);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.log('Geolocation denied or unavailable:', error.message);
          setLocationChecked(true);
          setWaitingForLocation(false);
          // Silently fail - courses will be shown without distance sorting
        },
        {
          timeout: 1000, // 1 second timeout for the geolocation API itself
          maximumAge: 300000, // Accept cached position up to 5 minutes old
        }
      );
    } else {
      setLocationChecked(true);
      setWaitingForLocation(false);
    }
  }, [locationChecked]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const fetchCourses = useCallback(async (pageToFetch: number, searchQuery: string, resetCourses = false) => {
    setLoading(true);
    clearMessage();
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const locationParam = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
      const res = await fetch(`/api/courses?limit=20&page=${pageToFetch}${searchParam}${locationParam}`);

      if (res.status === 401 || res.status === 403) {
        router.replace('/login');
        return;
      }

      const data = await res.json();

      if (data.type === 'error') {
        console.error('API Error:', data);
        throw new Error(data.message || 'Error fetching courses');
      }

      let coursesData = Array.isArray(data.courses) ? data.courses : [];

      setCourses((prev) => {
        if (resetCourses) {
          return coursesData;
        }
        const map = new Map(prev.map((c) => [c.id, c]));
        coursesData.forEach((c: Course) => map.set(c.id, c));
        return Array.from(map.values());
      });

      setHasMore(coursesData.length === 20);
      setPage(pageToFetch);

      if (data.message) showMessage(data.message, data.type || 'success');
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error fetching courses', 'error');
    } finally {
      setLoading(false);
    }
  }, [userLocation, router, clearMessage, showMessage]);

  // Initial load - wait for location check to complete
  useEffect(() => {
    if (status === 'authenticated' && locationChecked) {
      setCourses([]);
      setPage(1);
      setHasMore(true);
      fetchCourses(1, '', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, locationChecked]);

  // Refetch courses when location becomes available (to add distance sorting)
  useEffect(() => {
    if (status === 'authenticated' && locationChecked && userLocation && courses.length > 0) {
      // Only refetch if we have courses and just got location
      // This will update the courses with distance information
      fetchCourses(1, debouncedSearch, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  // Handle search changes
  useEffect(() => {
    if (status === 'authenticated' && locationChecked) {
      setCourses([]);
      setPage(1);
      setHasMore(true);
      fetchCourses(1, debouncedSearch, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const lastCourseRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchCourses(page + 1, debouncedSearch, false);
        }
      });
      if (node) observer.current.observe(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, hasMore, page, debouncedSearch]
  );

  if (status === 'loading' || !locationChecked) return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      <input
        type="text"
        placeholder="Search Courses"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="form-input"
        max={250}
      />

      {courses.length === 0 && !loading ? (
        <div style={{ textAlign: 'center'}}>
          <p className='secondary-text'>
            No courses found{search ? ' matching your search' : ''}.
          </p>
          <p style={{ fontSize: '0.9rem' }} className='secondary-text'>
            Can't find the course you're looking for?
          </p>
          <button
            type="button"
            onClick={() => router.push('/courses/search')}
            className="btn btn-save"
          >
            Search & Add Course from Global Database
          </button>
        </div>
      ) : (
        <div className="grid grid-1">
          {courses.map((course, index) => {
            const isLast = index === courses.length - 1;
            return (
              <div key={course.id} ref={isLast ? lastCourseRef : null}>
                <CourseCard
                  course={course}
                  locations={course.location ? [course.location] : []}
                  tees={[...(course.tees?.male || []), ...(course.tees?.female || [])]}
                />
                {/* Show ad after every 10 courses */}
                {(index + 1) % 10 === 0 && (
                  <InlineAdBanner adSlot="COURSES_SLOT_ID" className="my-4" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {loading && <p className='loading-text'>Loading courses...</p>}
    </div>
  );
}
