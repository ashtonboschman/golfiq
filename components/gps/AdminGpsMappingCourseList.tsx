'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GpsMappingCourseListItem,
  MappingStatusFilter,
} from '@/lib/gps/mappingCourseList';

type AdminGpsMappingCourseListProps = {
  initialCourses: GpsMappingCourseListItem[];
  initialHasMore: boolean;
  gpsMappingSchemaAvailable: boolean;
  query: string;
  status: MappingStatusFilter;
  latitude: number | null;
  longitude: number | null;
  startMappingAction: (formData: FormData) => Promise<void>;
};

type CoursePageResponse = {
  courses?: GpsMappingCourseListItem[];
  hasMore?: boolean;
  message?: string;
  type?: 'success' | 'error';
};

function statusLabel(status: string | null | undefined) {
  if (!status) return 'not started';
  return status === 'DRAFT' ? 'in progress' : status.toLowerCase();
}

export default function AdminGpsMappingCourseList({
  initialCourses,
  initialHasMore,
  gpsMappingSchemaAvailable,
  query,
  status,
  latitude,
  longitude,
  startMappingAction,
}: AdminGpsMappingCourseListProps) {
  const [courses, setCourses] = useState(initialCourses);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    const nextPage = page + 1;
    const params = new URLSearchParams({
      page: nextPage.toString(),
      status,
    });
    if (query) params.set('q', query);
    if (latitude !== null && longitude !== null) {
      params.set('lat', latitude.toString());
      params.set('lng', longitude.toString());
    }

    try {
      const response = await fetch(`/api/admin/gps-mapping/courses?${params.toString()}`);
      const data = await response.json() as CoursePageResponse;
      if (!response.ok || data.type === 'error') {
        throw new Error(data.message || 'Unable to load more courses.');
      }

      const nextCourses = Array.isArray(data.courses) ? data.courses : [];
      setCourses((currentCourses) => {
        const coursesById = new Map(currentCourses.map((course) => [course.id, course]));
        nextCourses.forEach((course) => coursesById.set(course.id, course));
        return Array.from(coursesById.values());
      });
      setPage(nextPage);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load more courses.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, latitude, longitude, page, query, status]);

  const lastCourseRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node || loading || !hasMore || loadError) return;

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void loadMore();
      }
    });
    observerRef.current.observe(node);
  }, [hasMore, loadError, loadMore, loading]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return (
    <section className="gps-admin-course-list" aria-label="GPS mapping courses">
      {courses.length === 0 && (
        <div className="gps-admin-empty" role="status">
          <h2>No courses match these filters.</h2>
          <p>Try another search or mapping status.</p>
        </div>
      )}
      {courses.map((course, index) => {
        const isFinishedMapping = course.mappedCourse?.mappingStatus === 'READY'
          || course.mappedCourse?.mappingStatus === 'VERIFIED';
        const isLastCourse = index === courses.length - 1;

        return (
          <article
            key={course.id}
            ref={isLastCourse ? lastCourseRef : null}
            className="gps-admin-course-row"
          >
            <div>
              <h2>{course.clubName}</h2>
              <p>
                {course.courseName}
                {course.location
                  ? ` | ${[
                      course.location.city,
                      course.location.state,
                      course.location.country,
                    ].filter(Boolean).join(', ')}`
                  : ''}
              </p>
              <span>
                {course.holeCount} scorecard holes | GPS status:{' '}
                <strong>{statusLabel(course.mappedCourse?.mappingStatus)}</strong>
                {course.mappedCourse ? ` | ${course.mappedCourse.mappedHoleCount} mapped holes` : ''}
                {course.requestCount > 0
                  ? ` | Requested by ${course.requestCount} ${course.requestCount === 1 ? 'user' : 'users'}`
                  : ''}
              </span>
            </div>
            <div className="gps-admin-course-action">
              {!gpsMappingSchemaAvailable ? (
                <button type="button" className="btn btn-secondary" disabled>
                  Migration Required
                </button>
              ) : course.mappedCourse ? (
                <Link
                  href={`/admin/gps-mapping/${course.id}`}
                  className={`btn ${isFinishedMapping ? 'btn-save' : 'btn-primary'}`}
                >
                  {isFinishedMapping ? 'Edit Mapping' : 'Continue Mapping'}
                </Link>
              ) : (
                <form action={startMappingAction}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <button type="submit" className="btn btn-secondary">Start Mapping</button>
                </form>
              )}
            </div>
          </article>
        );
      })}

      {loading && (
        <div className="gps-admin-empty" role="status">
          <p>Loading More Courses...</p>
        </div>
      )}
      {loadError && (
        <div className="gps-admin-empty" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()}>
            Try Again
          </button>
        </div>
      )}
    </section>
  );
}
