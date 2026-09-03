'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';
import { ChevronDown, ChevronLeft, ChevronRight, Landmark, MapPin, MapPinned, Plus } from 'lucide-react';
import { SkeletonBlock, SkeletonCircle } from '@/components/skeleton/Skeleton';
import LiveGpsHoleMap from '@/components/gps/LiveGpsHoleMap';
import { clearLiveRoundRecoveryState, decideAddRoundEntry } from '@/lib/rounds/liveRoundResume';
import type { LiveGpsMapping } from '@/lib/gps/liveMappingTypes';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { formatCourseLocation } from '@/lib/courses/formatCourseLocation';
import { HEADER_BACK_NAVIGATION_EVENT } from '@/lib/ui/headerBackNavigation';

async function readApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data as T;
}

interface Hole {
  id: number;
  hole_number: number;
  par: number;
  yardage: number;
  handicap?: number | null;
}

interface Tee {
  id: number;
  tee_name: string;
  gender: string;
  course_rating: number;
  slope_rating: number;
  total_yards: number;
  number_of_holes: number;
  holes?: Hole[];
  par_total: number;
}

interface Course {
  id: number;
  course_name: string;
  club_name?: string;
  location: {
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };
  tees: {
    male?: Tee[];
    female?: Tee[];
  };
}

type GpsCourseRequestState = {
  requestedByCurrentUser: boolean;
  status: 'REQUESTED' | 'MAPPED' | 'DISMISSED' | null;
  requestCount: number;
};

export default function CourseDetailsPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { showMessage, clearMessage, showConfirm } = useMessage();

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeeId, setSelectedTeeId] = useState('');
  const [teesGrouped, setTeesGrouped] = useState<Record<string, Tee[]>>({});
  const [liveGpsMapping, setLiveGpsMapping] = useState<LiveGpsMapping | null>(null);
  const [loadingLiveGpsAvailability, setLoadingLiveGpsAvailability] = useState(false);
  const [showGpsPreview, setShowGpsPreview] = useState(false);
  const [previewHoleNumber, setPreviewHoleNumber] = useState<number | null>(null);
  const [showGpsHolePicker, setShowGpsHolePicker] = useState(false);
  const [gpsCourseRequest, setGpsCourseRequest] = useState<GpsCourseRequestState | null>(null);
  const [loadingGpsCourseRequest, setLoadingGpsCourseRequest] = useState(false);
  const [requestingGpsCourse, setRequestingGpsCourse] = useState(false);
  const [gpsCourseRequestError, setGpsCourseRequestError] = useState<string | null>(null);

  const trackGpsEvent = useCallback((
    event: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS],
    properties: Record<string, unknown> = {},
  ) => {
    captureClientEvent(
      event,
      {
        source_surface: 'course_details',
        course_id: course?.id ?? Number(id),
        ...properties,
      },
      {
        pathname: `/courses/${id}`,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  }, [
    course?.id,
    id,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    status,
  ]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchCourse = async () => {
      setLoading(true);
      clearMessage();
      try {
        const res = await fetch(`/api/courses/${id}`);

        if ([401, 403].includes(res.status)) {
          router.replace('/login');
          return;
        }

        if (res.status === 404) {
          setCourse(null);
          showMessage('Course not found', 'error');
          return;
        }

        const data = await res.json();

        if (data.type === 'error') {
          setCourse(null);
          showMessage(data.message || 'Error fetching course', 'error');
          return;
        }

        const courseObj = data.course;
        setLoadingLiveGpsAvailability(true);
        setCourse(courseObj);

        const tees = [...(courseObj.tees.male || []), ...(courseObj.tees.female || [])];

        const grouped = tees.reduce((acc: Record<string, Tee[]>, tee: Tee) => {
          const g = tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1);
          (acc[g] ||= []).push(tee);
          return acc;
        }, {});
        setTeesGrouped(grouped);

        if (courseObj.tees.male?.length > 0) {
          const longest = courseObj.tees.male.reduce((a: Tee, b: Tee) =>
            b.total_yards > a.total_yards ? b : a
          );
          setSelectedTeeId(String(longest.id));
        } else if (tees.length > 0) {
          setSelectedTeeId(String(tees[0].id));
        } else {
          setSelectedTeeId('');
        }
      } catch (err: any) {
        setCourse(null);
        showMessage(err.message || 'Error fetching course', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id, status, router, showMessage, clearMessage]);

  useEffect(() => {
    if (status !== 'authenticated' || !course) {
      setLiveGpsMapping(null);
      setShowGpsPreview(false);
      setPreviewHoleNumber(null);
      setShowGpsHolePicker(false);
      setGpsCourseRequest(null);
      setGpsCourseRequestError(null);
      setLoadingLiveGpsAvailability(false);
      setLoadingGpsCourseRequest(false);
      setRequestingGpsCourse(false);
      return;
    }

    const controller = new AbortController();
    setLiveGpsMapping(null);
    setShowGpsPreview(false);
    setPreviewHoleNumber(null);
    setShowGpsHolePicker(false);
    setGpsCourseRequest(null);
    setGpsCourseRequestError(null);
    setLoadingLiveGpsAvailability(true);
    setLoadingGpsCourseRequest(false);
    setRequestingGpsCourse(false);

    void (async () => {
      try {
        const response = await fetch(`/api/gps/live/course/${course.id}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await readApiResponse<LiveGpsMapping>(response);
        if (controller.signal.aborted) return;

        setLiveGpsMapping(data);
        const hasFullCoverage = data.availability.available && data.availability.coverage === 'full';
        trackGpsEvent(ANALYTICS_EVENTS.gpsAvailable, {
          available: data.availability.available,
          coverage: data.availability.coverage,
          expected_hole_count: data.availability.expectedHoleNumbers.length,
          available_hole_count: data.availability.availableHoleNumbers.length,
          unavailable_hole_count: data.availability.unavailableHoleNumbers.length,
          reason: data.availability.reason,
        });

        if (!hasFullCoverage) {
          setLoadingGpsCourseRequest(true);
          try {
            const requestResponse = await fetch(
              `/api/gps/course-requests?courseId=${course.id}`,
              { cache: 'no-store', signal: controller.signal },
            );
            const requestData = await readApiResponse<GpsCourseRequestState>(requestResponse);
            if (!controller.signal.aborted) setGpsCourseRequest(requestData);
          } catch (requestError) {
            if (!controller.signal.aborted) {
              setGpsCourseRequestError(
                requestError instanceof Error
                  ? requestError.message
                  : 'Unable to load GPS request status',
              );
            }
          } finally {
            if (!controller.signal.aborted) setLoadingGpsCourseRequest(false);
          }
        }
      } catch {
        if (!controller.signal.aborted) setLiveGpsMapping(null);
      } finally {
        if (!controller.signal.aborted) setLoadingLiveGpsAvailability(false);
      }
    })();

    return () => controller.abort();
  }, [course, status, trackGpsEvent]);

  useEffect(() => {
    if (!showGpsPreview) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGpsPreview(false);
    };
    const handleHeaderBack = (event: Event) => {
      event.preventDefault();
      setShowGpsPreview(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(HEADER_BACK_NAVIGATION_EVENT, handleHeaderBack);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(HEADER_BACK_NAVIGATION_EVENT, handleHeaderBack);
    };
  }, [showGpsPreview]);

  const allTees = useMemo(
    () => [...(course?.tees.male || []), ...(course?.tees.female || [])],
    [course]
  );
  const selectedTee = useMemo(
    () => allTees.find((t) => String(t.id) === String(selectedTeeId)),
    [allTees, selectedTeeId]
  );

  const selectOptions = useMemo(() => {
    if (!teesGrouped || Object.keys(teesGrouped).length === 0) return [];
    return Object.entries(teesGrouped).map(([gender, tees]) => ({
      label: gender,
      options: tees.map((t) => ({
        value: String(t.id),
        label: `${t.tee_name} ${t.total_yards} yd (${t.course_rating}/${t.slope_rating}) ${t.number_of_holes} holes`,
      })),
    }));
  }, [teesGrouped]);

  const showDataSkeleton = status === 'loading' || loading || loadingLiveGpsAvailability;
  const previewHoles = useMemo(
    () => [...(liveGpsMapping?.holes ?? [])].sort((a, b) => a.holeNumber - b.holeNumber),
    [liveGpsMapping?.holes],
  );

  const computeTotals = (list: Hole[]) =>
    list.reduce(
      (acc, h) => {
        acc.par += Number(h.par || 0);
        acc.yards += Number(h.yardage || 0);
        return acc;
      },
      { par: 0, yards: 0 }
    );

  if (!showDataSkeleton && !course) return null;

  const holes = selectedTee?.holes || [];
  const hasHandicap = holes.some((h) => h.handicap != null);

  const front9Totals = computeTotals(holes.slice(0, 9));
  const back9Totals = computeTotals(holes.slice(9, 18));
  const fullTotals = computeTotals(holes);

  const handleAddRoundClick = () => {
    if (!course) return;
    const sessionUserId = session?.user?.id ? String(session.user.id) : null;
    if (!sessionUserId) return;

    const startNewTarget = `/rounds/add?courseId=${course.id}&courseName=${encodeURIComponent(
      course.course_name,
    )}&teeId=${selectedTee?.id}&teeName=${encodeURIComponent(
      selectedTee?.tee_name || '',
    )}&from=${encodeURIComponent(`/courses/${course.id}`)}`;

    const decision = decideAddRoundEntry({
      userId: sessionUserId,
      startNewTarget,
    });

    if (decision.action === 'resume') {
      router.push(decision.resumeTarget);
      return;
    }

    if (decision.action === 'prompt') {
      showConfirm({
        title: 'Delete active live round?',
        message:
          'You already have an active Live Round. Resume it, or start a new round and delete the current one.',
        cancelText: 'Resume Round',
        confirmText: 'Delete & Start',
        variant: 'danger',
        confirmVariant: 'danger',
        onCancel: () => {
          router.push(decision.resumeTarget);
        },
        onConfirm: () => {
          clearLiveRoundRecoveryState(sessionUserId);
          router.push(decision.startNewTarget);
        },
      });
      return;
    }

    router.push(decision.startNewTarget);
  };

  const handleRequestGpsCourse = async () => {
    if (!course || requestingGpsCourse) return;

    setRequestingGpsCourse(true);
    setGpsCourseRequestError(null);
    try {
      const response = await fetch('/api/gps/course-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id }),
      });
      await readApiResponse<{ requested: boolean; status: 'REQUESTED'; message: string }>(response);
      const nextRequestCount =
        (gpsCourseRequest?.requestCount ?? 0) + (gpsCourseRequest?.requestedByCurrentUser ? 0 : 1);
      setGpsCourseRequest({
        requestedByCurrentUser: true,
        status: 'REQUESTED',
        requestCount: nextRequestCount,
      });
      trackGpsEvent(ANALYTICS_EVENTS.gpsMappingRequested, {
        request_count: nextRequestCount,
      });
    } catch (error) {
      setGpsCourseRequestError(
        error instanceof Error ? error.message : 'Unable to request GPS mapping',
      );
    } finally {
      setRequestingGpsCourse(false);
    }
  };

  const hasFullGpsCoverage = Boolean(
    liveGpsMapping?.availability.available
      && liveGpsMapping.availability.coverage === 'full'
      && previewHoles.length > 0,
  );
  const activePreviewHoleIndex = Math.max(
    0,
    previewHoles.findIndex((hole) => hole.holeNumber === previewHoleNumber),
  );
  const activePreviewHole = previewHoles[activePreviewHoleIndex] ?? null;
  const activeScorecardHole = selectedTee?.holes?.find(
    (hole) => hole.hole_number === activePreviewHole?.holeNumber,
  );

  const openGpsPreview = () => {
    if (!previewHoles.length) return;
    setPreviewHoleNumber(previewHoles[0].holeNumber);
    setShowGpsHolePicker(false);
    setShowGpsPreview(true);
  };

  const selectPreviewHole = (holeNumber: number) => {
    setPreviewHoleNumber(holeNumber);
    setShowGpsHolePicker(false);
  };

  return (
    <div className="page-stack">
      <button
        className="btn btn-add"
        onClick={handleAddRoundClick}
        disabled={showDataSkeleton || !course || !allTees.length}
      >
        <Plus/> Add Round
      </button>

      <div className="card course-card">
        <div className="course-name-container">
          {showDataSkeleton ? (
            <SkeletonBlock width="42%" height={25} />
          ) : (
            <h1 className="course-name">{course?.course_name ?? ''}</h1>
          )}
          {showDataSkeleton ? (
            <SkeletonBlock className="skeleton-holes-tag" height={22} />
          ) : (
            <p className="round-holes-tag">
              {selectedTee?.number_of_holes} Holes
            </p>
          )}
        </div>
        <div className="course-club">
          {showDataSkeleton ? (
            <SkeletonBlock width="34%" height={14} inline />
          ) : (
            <>
              <strong><Landmark size='14'/></strong>{' '}
              {course?.club_name ?? ''}
            </>
          )}
        </div>
        <div className="course-location">
          {showDataSkeleton ? (
            <SkeletonBlock width="56%" height={14} inline />
          ) : (
            <>
              <strong><MapPin size='14'/></strong>{' '}
              {formatCourseLocation(course?.location)}
            </>
          )}
        </div>
      </div>

      {showDataSkeleton ? (
        <section
          className="card course-gps-status-card"
          aria-label="Loading Live GPS status"
          aria-busy="true"
        >
          <div className="course-gps-status-row">
            <div className="course-gps-status-copy course-gps-status-skeleton-copy">
              <SkeletonCircle size={38} />
              <div className="course-gps-status-skeleton-lines">
                <SkeletonBlock width={72} height={16} />
                <SkeletonBlock width="100%" height={12} mt={5} />
              </div>
            </div>
            <SkeletonBlock width={94} height={36} rounded="pill" />
          </div>
          <SkeletonBlock className="skeleton-btn" height={40} />
        </section>
      ) : course && (
        <section className="card course-gps-status-card" aria-label="Live GPS status">
          <div className="course-gps-status-row">
            <div className="course-gps-status-copy">
              <span className={`course-gps-status-icon ${hasFullGpsCoverage ? 'is-available' : ''}`}>
                <MapPinned size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Live GPS</strong>
                <p className="combined-note">
                  {loadingLiveGpsAvailability || loadingGpsCourseRequest
                    ? 'Checking GPS mapping...'
                    : hasFullGpsCoverage
                      ? 'Hole maps and distances are ready for live rounds.'
                      : gpsCourseRequest?.requestedByCurrentUser
                        ? 'GPS mapping requested. We will prioritize this course.'
                        : 'Hole maps are not available for this course yet.'}
                </p>
              </div>
            </div>

            {loadingLiveGpsAvailability || loadingGpsCourseRequest ? (
              <SkeletonBlock width={94} height={36} />
            ) : hasFullGpsCoverage ? (
              <span className="course-gps-status-pill">Available</span>
            ) : (
              <button
                type="button"
                className={`btn btn-secondary live-gps-request-button ${
                  gpsCourseRequest?.requestedByCurrentUser
                    ? 'live-gps-request-status'
                    : ''
                }`}
                disabled={requestingGpsCourse || gpsCourseRequest?.requestedByCurrentUser}
                onClick={handleRequestGpsCourse}
              >
                {gpsCourseRequest?.requestedByCurrentUser
                  ? 'Requested'
                  : requestingGpsCourse
                    ? 'Requesting...'
                    : 'Request GPS'}
              </button>
            )}
          </div>

          {hasFullGpsCoverage && (
            <button
              type="button"
              className="btn btn-secondary course-gps-preview-button"
              onClick={openGpsPreview}
            >
              Preview Course
            </button>
          )}

          {gpsCourseRequestError && (
            <span className="live-gps-request-error" role="alert">
              {gpsCourseRequestError}
            </span>
          )}
        </section>
      )}

      {showGpsPreview && activePreviewHole && (
        <section
          className="live-round-gps-fullscreen course-gps-preview"
          role="dialog"
          aria-modal="true"
          aria-label={`GPS preview for hole ${activePreviewHole.holeNumber}`}
        >
          <div className="live-round-gps-map-layer">
            <LiveGpsHoleMap
              apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
              hole={activePreviewHole}
              courseHoles={previewHoles}
              par={activeScorecardHole?.par ?? null}
              routeKey={`course-${course?.id}-hole-${activePreviewHole.holeNumber}`}
            />
          </div>

          <div className="live-round-gps-hud course-gps-preview-hud">
            <div className="live-round-gps-hole-menu">
              <button
                type="button"
                className={`live-round-gps-hole-card${showGpsHolePicker ? ' is-open' : ''}`}
                onClick={() => setShowGpsHolePicker((current) => !current)}
                aria-expanded={showGpsHolePicker}
                aria-controls="course-gps-preview-hole-picker"
              >
                <strong>
                  Hole {activePreviewHole.holeNumber}
                  <ChevronDown size={18} aria-hidden="true" />
                </strong>
                <small className="live-round-gps-hole-meta">
                  {activeScorecardHole
                    ? `Par ${activeScorecardHole.par} · ${activeScorecardHole.yardage} yd${activeScorecardHole.handicap == null ? '' : ` · HCP ${activeScorecardHole.handicap}`}`
                    : 'Mapped hole'}
                </small>
              </button>

              {showGpsHolePicker && (
                <div
                  id="course-gps-preview-hole-picker"
                  className="live-round-gps-hole-picker course-gps-preview-hole-picker"
                  role="dialog"
                  aria-label="Choose Hole"
                >
                  <div className="live-round-gps-hole-picker-grid">
                    {previewHoles.map((hole) => {
                      const isActive = hole.holeNumber === activePreviewHole.holeNumber;
                      return (
                        <button
                          key={hole.holeNumber}
                          type="button"
                          className={`live-round-gps-hole-picker-option${isActive ? ' is-active' : ''}`}
                          onClick={() => selectPreviewHole(hole.holeNumber)}
                          aria-current={isActive ? 'true' : undefined}
                        >
                          {hole.holeNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            className="live-round-gps-controls"
            role="group"
            aria-label="Hole navigation"
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => selectPreviewHole(previewHoles[activePreviewHoleIndex - 1].holeNumber)}
              disabled={activePreviewHoleIndex === 0}
            >
              <ChevronLeft size={18} aria-hidden="true" />
              Previous Hole
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => selectPreviewHole(previewHoles[activePreviewHoleIndex + 1].holeNumber)}
              disabled={activePreviewHoleIndex === previewHoles.length - 1}
            >
              Next Hole
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <div className="card tee-select-card">
        <label htmlFor="tee-select">
          <strong >Select Tee</strong>
        </label>

        {showDataSkeleton ? (
          <SkeletonBlock className="skeleton-select" height={42} />
        ) : allTees.length > 0 ? (
          <Select
            value={
              selectedTee
                ? {
                    value: String(selectedTee.id),
                    label: `${selectedTee.tee_name} ${selectedTee.total_yards} yd (${selectedTee.course_rating}/${selectedTee.slope_rating}) ${selectedTee.number_of_holes} holes`,
                  }
                : null
            }
            options={selectOptions}
            onChange={(option) => setSelectedTeeId(option?.value ?? '')}
            isClearable
            isSearchable={false}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
            styles={{
              ...selectStyles,
              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            }}
          />
        ) : (
          <p>No tees available for this course.</p>
        )}
      </div>

      {(showDataSkeleton || selectedTee) && (
        <div className="card course-scorecard-meta">
          <div>
            <strong className='form-label'>Par</strong>{' '}
            {showDataSkeleton ? <SkeletonBlock width={32} height={14} inline /> : selectedTee?.par_total}
          </div>
          <div>
            <strong className='form-label'>Yards</strong>{' '}
            {showDataSkeleton ? <SkeletonBlock width={48} height={14} inline /> : selectedTee?.total_yards}
          </div>
          <div>
            <strong className='form-label'>Rating / Slope</strong>{' '}
            {showDataSkeleton ? (
              <SkeletonBlock width={72} height={14} inline />
            ) : (
              `${selectedTee?.course_rating} / ${selectedTee?.slope_rating}`
            )}
          </div>
        </div>
      )}

      {showDataSkeleton ? (
        <div className="card course-scorecard-wrapper">
          <SkeletonBlock width="100%" height={241} />
        </div>
      ) : selectedTee && holes.length > 0 && (
        <div className="card course-scorecard-wrapper">
          <table className="course-scorecard-left">
            <thead>
              <tr>
                <th>Hole</th>
              </tr>
              <tr>
                <th>Par</th>
              </tr>
              <tr>
                <th>Yards</th>
              </tr>
              {hasHandicap && (
                <tr>
                  <th>Hcp</th>
                </tr>
              )}
            </thead>
          </table>

          <div className="course-scorecard-scroll">
            <table className="course-scorecard-right">
              <thead>
                <tr>
                  {holes.map((h) => (
                    <th key={h.id}>{h.hole_number}</th>
                  ))}
                  <th>OUT</th>
                  {selectedTee.number_of_holes === 18 && <th>IN</th>}
                  <th>TOTAL</th>
                </tr>
                <tr>
                  {holes.map((h) => (
                    <th key={h.id}>{h.par}</th>
                  ))}
                  <th>{front9Totals.par}</th>
                  {selectedTee.number_of_holes === 18 && <th>{back9Totals.par}</th>}
                  <th>{fullTotals.par}</th>
                </tr>
                <tr>
                  {holes.map((h) => (
                    <th key={h.id}>{h.yardage}</th>
                  ))}
                  <th>{front9Totals.yards}</th>
                  {selectedTee.number_of_holes === 18 && <th>{back9Totals.yards}</th>}
                  <th>{fullTotals.yards}</th>
                </tr>
                {hasHandicap && (
                  <tr>
                    {holes.map((h) => (
                      <th key={h.id}>{h.handicap ?? '-'}</th>
                    ))}
                    <th>-</th>
                    {selectedTee.number_of_holes === 18 && <th>-</th>}
                    <th>-</th>
                  </tr>
                )}
              </thead>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
