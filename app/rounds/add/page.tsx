'use client';

import { useCallback, useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { GroupBase } from 'react-select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { AsyncPaginate } from 'react-select-async-paginate';
import { selectStyles } from '@/lib/selectStyles';
import HoleCard from '@/components/HoleCard';
import { getLocalDateString } from '@/lib/dateUtils';
import { CalendarDays, Clock, Play, Plus, Trash2 } from 'lucide-react';
import Select from 'react-select';
import { resolveTeeContext, getValidTeeSegments, type TeeForResolver, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { markInsightsNudgePending, markRoundInsightsRefreshPending } from '@/lib/insights/insightsNudge';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import { requestLiveRoundGpsPermission } from '@/lib/gps/browserLocation';
import { isAdminUserId } from '@/lib/admin';
import { getRoundAddDraftKey } from '@/lib/rounds/addDraft';
import {
  DEFAULT_LIVE_ROUND_TRACKING_PREFS,
  normalizeLiveRoundTrackingPrefs,
  profileFieldsToLiveRoundTrackingPrefs,
  type LiveRoundTrackingPrefs,
  type LiveRoundTrackingProfileFields,
} from '@/lib/rounds/liveRoundTracking';
import {
  buildLiveRoundContextFromDraft,
  clearDashboardResumeCtaSnooze,
  clearLiveRoundContext,
  clearLiveRoundRecoveryState,
  readLiveRoundContext,
  writeLiveRoundContext,
} from '@/lib/rounds/liveRoundResume';
import {
  teeSegmentLabel,
  type LiveGpsAvailability,
  type LiveRoundSession,
} from '@/components/rounds/live/types';

// Map API tee object (snake_case) to TeeForResolver (camelCase)
function apiTeeToResolver(tee: any): TeeForResolver {
  return {
    numberOfHoles: tee.number_of_holes,
    courseRating: tee.course_rating,
    slopeRating: tee.slope_rating,
    bogeyRating: tee.bogey_rating,
    parTotal: tee.par_total,
    nonPar3Holes: (tee.holes || []).filter((h: any) => h.par !== 3).length,
    frontCourseRating: tee.front_course_rating,
    frontSlopeRating: tee.front_slope_rating,
    frontBogeyRating: tee.front_bogey_rating,
    backCourseRating: tee.back_course_rating,
    backSlopeRating: tee.back_slope_rating,
    backBogeyRating: tee.back_bogey_rating,
    holes: (tee.holes || []).map((h: any) => ({ holeNumber: h.hole_number, par: h.par })),
  };
}

interface Round {
  date: string;
  course_id: string;
  tee_id: string;
  round_context: RoundContext;
  tee_segment: TeeSegment;
  hole_by_hole: number;
  score: number | null;
  notes: string;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greenside_bunker_shots: number | null;
  short_game_shots: number | null;
  round_holes: any[];
  par_total?: number | null;
}

interface HoleScore {
  hole_id: number;
  hole_number: number;
  pass: number;
  par: number | null;
  score: number | null;
  fir_hit: number | null;
  fir_direction: 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long' | null;
  gir_hit: number | null;
  gir_direction: 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long' | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greenside_bunker_shots: number | null;
}

interface CourseOption {
  label: string;
  value: number;
}

interface TeeOption {
  label: string;
  value: number;
  teeObj?: any;
}

type RoundContext = 'real' | 'simulator' | 'practice';

type TaggedRoundContext = Exclude<RoundContext, 'real'>;
type RoundEntryMode = 'live' | 'after';

type ApiResponse<T> = T & {
  message?: string;
};

const ADD_ROUND_DIRTY_KEY = 'golfiq-add-round-dirty';

const roundTagOptions: Array<{ value: TaggedRoundContext; label: string }> = [
  { value: 'simulator', label: 'Simulator Round' },
  { value: 'practice', label: 'Practice Round' },
];

const courseSelectStyles = {
  ...selectStyles,
  control: (base: any, state: any) => ({
    ...selectStyles.control(base, state),
    height: '44px',
    minHeight: '44px',
    padding: '0 2px',
  }),
  valueContainer: (base: any) => ({
    ...selectStyles.valueContainer(base),
    height: '42px',
  }),
  indicatorsContainer: (base: any) => ({
    ...base,
    height: '42px',
  }),
};

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

function sessionCourseLabel(session: LiveRoundSession) {
  if (!session.course) return 'Selected Course';
  return session.course.club_name === session.course.course_name
    ? session.course.course_name
    : `${session.course.club_name} - ${session.course.course_name}`;
}

function formatSessionDate(date: string) {
  return date ? date.slice(0, 10) : '';
}

function formatSavedTime(value: string | null) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved recently';
  return `Saved ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

type AddRoundDraft = {
  version: 1;
  savedAt: string;
  round: Round;
  holeScores: HoleScore[];
  selectedCourse: CourseOption | null;
  selectedTee: TeeOption | null;
  completedHoles: number[];
  expandedHole: number;
  liveRoundTracking: LiveRoundTrackingPrefs;
  liveStartHoleNumber?: number;
};

function AddRoundContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || 'rounds'; // Default to rounds if not specified
  const { data: session, status } = useSession();
  const { showMessage, clearMessage, showConfirm } = useMessage();

  // Helper to get the back URL based on 'from' parameter
  const getBackUrl = () => {
    if (from.startsWith('/')) {
      // Full URL path (e.g., /courses/123)
      return from;
    }
    switch (from) {
      case 'dashboard':
        return '/dashboard';
      case 'onboarding':
        return '/post-signup';
      case 'rounds':
      default:
        return '/rounds';
    }
  };

  const [round, setRound] = useState<Round>({
    date: getLocalDateString(), // Use local timezone instead of UTC
    course_id: '',
    tee_id: '',
    round_context: 'real',
    tee_segment: 'full',
    hole_by_hole: 0,
    score: null,
    notes: '',
    fir_hit: null,
    gir_hit: null,
    putts: null,
    penalties: null,
    chips: null,
    greenside_bunker_shots: null,
    short_game_shots: null,
    round_holes: [],
  });

  const [segmentOptions, setSegmentOptions] = useState<{ value: TeeSegment; label: string }[]>([]);

  const [holes, setHoles] = useState<any[]>([]);
  const [holeScores, setHoleScores] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);
  const [showRoundTagPicker, setShowRoundTagPicker] = useState(false);
  const userProfileRef = useRef<({
    default_tee?: string;
    gender?: string;
  } & LiveRoundTrackingProfileFields) | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedHole, setExpandedHole] = useState<number>(1); // Track which hole is currently expanded
  const [completedHoles, setCompletedHoles] = useState<Set<number>>(new Set()); // Track holes where Next was clicked
  const [liveRoundTracking, setLiveRoundTracking] = useState<LiveRoundTrackingPrefs>(
    DEFAULT_LIVE_ROUND_TRACKING_PREFS,
  );
  const [roundEntryMode, setRoundEntryMode] = useState<RoundEntryMode>(
    searchParams.get('mode') === 'after' ? 'after' : 'live',
  );
  const [activeLiveSessions, setActiveLiveSessions] = useState<LiveRoundSession[]>([]);
  const [loadingLiveSessions, setLoadingLiveSessions] = useState(false);
  const [liveStartError, setLiveStartError] = useState<string | null>(null);
  const [showLiveStartSetup, setShowLiveStartSetup] = useState(false);
  const [startingLiveRound, setStartingLiveRound] = useState(false);
  const [discardingLiveSessionId, setDiscardingLiveSessionId] = useState<string | null>(null);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [liveStartHoleNumber, setLiveStartHoleNumber] = useState(1);
  const [liveGpsEnabled, setLiveGpsEnabled] = useState(false);
  const [liveGpsTestLocationEnabled, setLiveGpsTestLocationEnabled] = useState(false);
  const [liveGpsAvailability, setLiveGpsAvailability] = useState<LiveGpsAvailability | null>(null);
  const [loadingLiveGpsAvailability, setLoadingLiveGpsAvailability] = useState(false);
  const holeCardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const holeScoresRef = useRef<HoleScore[]>([]);
  const hasSubmittedRef = useRef(false);
  const hasInteractedRef = useRef(false);
  const startTrackedRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const draftHydrationAttemptedRef = useRef(false);
  const unauthDraftWarningShownRef = useRef(false);
  const latestModeRef = useRef<'live_round' | 'after_round'>(
    searchParams.get('mode') === 'after' ? 'after_round' : 'live_round',
  );
  const latestStepRef = useRef<'initial' | 'course_selected' | 'tee_selected'>('initial');
  const liveRoundTrackingReadyRef = useRef(false);
  const initialDateRef = useRef(round.date);
  const allowBrowserBackRef = useRef(false);
  const hasPushedBackGuardRef = useRef(false);
  const roundAddDraftKey = useMemo(
    () => getRoundAddDraftKey(session?.user?.id),
    [session?.user?.id],
  );
  const isAdmin = status === 'authenticated' && isAdminUserId(session?.user?.id);

  const trackEvent = useCallback((event: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS], properties: Record<string, unknown> = {}) => {
    captureClientEvent(
      event,
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
  }, [pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  // Update segment options when a tee is selected
  const updateSegmentOptions = useCallback((teeObj: any, preferredSegment?: TeeSegment) => {
    if (!teeObj) {
      setSegmentOptions([]);
      setRound(prev => ({ ...prev, tee_segment: 'full' }));
      return;
    }
    const resolver = apiTeeToResolver(teeObj);
    const segments = getValidTeeSegments(resolver);
    setSegmentOptions(segments);
    const nextSegment =
      preferredSegment && segments.some((segment) => segment.value === preferredSegment)
        ? preferredSegment
        : 'full';
    setRound(prev => ({ ...prev, tee_segment: nextSegment }));
  }, []);

  const isHBH = false;
  const isAfterRoundMode = roundEntryMode === 'after';

  const markUserEdited = useCallback(() => {
    hasInteractedRef.current = true;
    setHasUserEdited(true);
  }, []);

  useEffect(() => {
    if (status !== 'unauthenticated') {
      unauthDraftWarningShownRef.current = false;
      return;
    }

    const hasInMemoryProgress = Boolean(
      round.course_id ||
      round.tee_id ||
      round.score != null ||
      round.fir_hit != null ||
      round.gir_hit != null ||
      round.putts != null ||
      round.penalties != null ||
      round.chips != null ||
      round.greenside_bunker_shots != null ||
      round.notes.trim().length > 0 ||
      holeScores.some((hole) =>
        hole.score != null ||
        hole.fir_hit != null ||
        hole.fir_direction != null ||
        hole.gir_hit != null ||
        hole.gir_direction != null ||
        hole.putts != null ||
        hole.penalties != null ||
        hole.chips != null ||
        hole.greenside_bunker_shots != null),
    );

    let hasPersistedDraft = false;
    if (roundAddDraftKey) {
      try {
        hasPersistedDraft = Boolean(localStorage.getItem(roundAddDraftKey));
      } catch {
        hasPersistedDraft = false;
      }
    }

    if (hasInMemoryProgress || hasPersistedDraft) {
      if (!unauthDraftWarningShownRef.current) {
        showMessage(
          'Connection/session issue detected. Your in-progress round is kept on this screen. Reconnect and save, or use Cancel to exit.',
          'error',
        );
        unauthDraftWarningShownRef.current = true;
      }
      return;
    }

    if (!hasInMemoryProgress && !hasPersistedDraft) {
      router.replace('/login');
    }
  }, [status, router, showMessage, roundAddDraftKey, round, holeScores]);

  useEffect(() => {
    if (status !== 'authenticated' || startTrackedRef.current) return;
    startTrackedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.roundAddStarted, {
      round_logging_mode_selected: roundEntryMode === 'live' ? 'live_round' : 'after_round',
      holes_target: round.tee_segment === 'double9' || round.tee_segment === 'full' ? 18 : 9,
    });
  }, [round.tee_segment, roundEntryMode, status, trackEvent]);

  useEffect(() => {
    latestModeRef.current = roundEntryMode === 'live' ? 'live_round' : 'after_round';
  }, [roundEntryMode]);

  useEffect(() => {
    latestStepRef.current = round.tee_id
      ? 'tee_selected'
      : round.course_id
        ? 'course_selected'
        : 'initial';
  }, [round.course_id, round.tee_id]);

  useEffect(() => {
    if (status !== 'authenticated' || !roundAddDraftKey || draftHydrationAttemptedRef.current) return;
    draftHydrationAttemptedRef.current = true;

    try {
      const rawDraft = localStorage.getItem(roundAddDraftKey);
      if (!rawDraft) return;

      const parsed = JSON.parse(rawDraft) as AddRoundDraft;
      if (!parsed || parsed.version !== 1 || !parsed.round) {
        localStorage.removeItem(roundAddDraftKey);
        return;
      }

      restoredDraftRef.current = true;
      hasInteractedRef.current = true;
      setHasUserEdited(true);
      setRound((prev) => ({ ...prev, ...parsed.round }));
      setHoleScores(Array.isArray(parsed.holeScores) ? parsed.holeScores : []);
      setSelectedCourse(parsed.selectedCourse ?? null);
      setSelectedTee(parsed.selectedTee ?? null);
      const completed = Array.isArray(parsed.completedHoles)
        ? parsed.completedHoles.filter((value) => Number.isFinite(value))
        : [];
      setCompletedHoles(new Set(completed));
      setExpandedHole(Number.isFinite(parsed.expandedHole) ? parsed.expandedHole : 1);
      if (parsed.liveRoundTracking) {
        setLiveRoundTracking(normalizeLiveRoundTrackingPrefs(parsed.liveRoundTracking));
        liveRoundTrackingReadyRef.current = true;
      }
      setLiveStartHoleNumber(
        Number.isFinite(parsed.liveStartHoleNumber) ? (parsed.liveStartHoleNumber as number) : 1,
      );

      if (parsed.selectedTee?.teeObj) {
        updateSegmentOptions(parsed.selectedTee.teeObj, parsed.round.tee_segment);
      }

      setInitialized(true);
      showMessage('Recovered your in-progress round draft.', 'success');
    } catch (error) {
      console.error('Failed to restore add-round draft:', error);
      try {
        localStorage.removeItem(roundAddDraftKey);
      } catch {
        // noop
      }
    }
  }, [roundAddDraftKey, showMessage, status, updateSegmentOptions]);

  useEffect(() => {
    holeScoresRef.current = holeScores;
  }, [holeScores]);

  const clearRoundDraft = useCallback(() => {
    clearLiveRoundRecoveryState(session?.user?.id);
  }, [session?.user?.id]);

  const refreshActiveLiveSessions = useCallback(async () => {
    if (status !== 'authenticated') return;

    setLoadingLiveSessions(true);
    setLiveStartError(null);
    try {
      const response = await fetch('/api/rounds/live/sessions', { cache: 'no-store' });
      const data = await readApiResponse<{ sessions: LiveRoundSession[] }>(response);
      const sessions = data.sessions || [];
      setActiveLiveSessions(sessions);
      setShowLiveStartSetup((current) => current || sessions.length === 0);
    } catch (error) {
      setLiveStartError(error instanceof Error ? error.message : 'Unable to load active live rounds');
      setShowLiveStartSetup(true);
    } finally {
      setLoadingLiveSessions(false);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    refreshActiveLiveSessions();
  }, [refreshActiveLiveSessions, status]);

  useEffect(() => {
    const requestedMode = searchParams.get('mode');
    if (requestedMode === 'live') setRoundEntryMode('live');
    if (requestedMode === 'after') setRoundEntryMode('after');
  }, [searchParams]);

  useEffect(() => {
    if (roundEntryMode !== 'live' || !selectedCourse) {
      setLiveGpsAvailability(null);
      setLoadingLiveGpsAvailability(false);
      setLiveGpsEnabled(false);
      setLiveGpsTestLocationEnabled(false);
      return;
    }

    const controller = new AbortController();
    setLiveGpsAvailability(null);
    setLoadingLiveGpsAvailability(true);
    setLiveGpsEnabled(false);
    setLiveGpsTestLocationEnabled(false);

    void (async () => {
      try {
        const response = await fetch(`/api/gps/live/course/${selectedCourse.value}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await readApiResponse<{ availability: LiveGpsAvailability }>(response);
        if (!controller.signal.aborted) {
          setLiveGpsAvailability(data.availability);
          setLiveGpsEnabled(
            data.availability.available && data.availability.coverage === 'full',
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLiveGpsAvailability(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingLiveGpsAvailability(false);
        }
      }
    })();

    return () => controller.abort();
  }, [roundEntryMode, selectedCourse]);

  const buildCurrentDraft = useCallback((): AddRoundDraft => ({
    version: 1,
    savedAt: new Date().toISOString(),
    round,
    holeScores,
    selectedCourse,
    selectedTee,
    completedHoles: Array.from(completedHoles),
    expandedHole,
    liveRoundTracking,
    liveStartHoleNumber,
  }), [
    completedHoles,
    expandedHole,
    holeScores,
    liveRoundTracking,
    round,
    selectedCourse,
    selectedTee,
    liveStartHoleNumber,
  ]);

  const hasDraftProgress = useCallback(() => Boolean(
    round.date !== initialDateRef.current ||
    round.course_id ||
    round.tee_id ||
    round.round_context !== 'real' ||
    round.tee_segment !== 'full' ||
    liveStartHoleNumber !== 1 ||
    round.score != null ||
    round.fir_hit != null ||
    round.gir_hit != null ||
    round.putts != null ||
    round.penalties != null ||
    round.chips != null ||
    round.greenside_bunker_shots != null ||
    round.notes.trim().length > 0 ||
    holeScores.some((hole) =>
      hole.score != null ||
      hole.fir_hit != null ||
      hole.fir_direction != null ||
      hole.gir_hit != null ||
      hole.gir_direction != null ||
      hole.putts != null ||
      hole.penalties != null ||
      hole.chips != null ||
      hole.greenside_bunker_shots != null),
  ), [holeScores, liveStartHoleNumber, round]);

  const isRoundAddDirty = hasUserEdited && hasDraftProgress();

  const clearAddRoundDirtyState = useCallback(() => {
    setHasUserEdited(false);
    hasInteractedRef.current = false;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ADD_ROUND_DIRTY_KEY);
    }
  }, []);

  const confirmLeaveAddRound = useCallback((onDiscard: () => void) => {
    if (!isRoundAddDirty) {
      onDiscard();
      return;
    }

    showConfirm({
      title: 'Discard changes?',
      message: 'You have unsaved round details.',
      cancelText: 'Stay',
      confirmText: 'Discard',
      variant: 'warning',
      confirmVariant: 'danger',
      onConfirm: () => {
        clearRoundDraft();
        clearAddRoundDirtyState();
        onDiscard();
      },
    });
  }, [clearAddRoundDirtyState, clearRoundDraft, isRoundAddDirty, showConfirm]);

  const persistDraftAndResumeContext = useCallback(() => {
    if (status !== 'authenticated' || !roundAddDraftKey) return;

    const hasProgress = hasDraftProgress();
    if (!hasProgress) {
      clearRoundDraft();
      return;
    }

    const draft = buildCurrentDraft();
    try {
      localStorage.setItem(roundAddDraftKey, JSON.stringify(draft));
    } catch {
      // noop
    }

    const userId = session?.user?.id ? String(session.user.id) : null;
    if (!userId) return;

    if (!isHBH) {
      clearLiveRoundContext(userId);
      return;
    }

    const sourcePage = from.startsWith('/') ? from : `/${from}`;
    const route = `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
    const nextContext = buildLiveRoundContextFromDraft({
      userId,
      route,
      sourcePage,
      draft,
      previousContext: readLiveRoundContext(userId),
    });

    if (!nextContext) {
      clearLiveRoundContext(userId);
      return;
    }

    writeLiveRoundContext(nextContext);
    clearDashboardResumeCtaSnooze(userId);
  }, [
    buildCurrentDraft,
    clearRoundDraft,
    from,
    hasDraftProgress,
    isHBH,
    pathname,
    roundAddDraftKey,
    session?.user?.id,
    status,
  ]);

  useEffect(() => {
    if (status !== 'authenticated' || !roundAddDraftKey) return;

    const timeout = window.setTimeout(() => {
      persistDraftAndResumeContext();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [persistDraftAndResumeContext, roundAddDraftKey, status]);

  useEffect(() => {
    return () => {
      if (!startTrackedRef.current) return;
      if (hasSubmittedRef.current) return;
      if (!hasInteractedRef.current) return;

      trackEvent(ANALYTICS_EVENTS.roundAddAbandoned, {
        mode: latestModeRef.current,
        step_reached: latestStepRef.current,
        dirty_state: true,
      });
    };
  }, [trackEvent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isRoundAddDirty) {
      sessionStorage.setItem(ADD_ROUND_DIRTY_KEY, 'true');
    } else {
      sessionStorage.removeItem(ADD_ROUND_DIRTY_KEY);
      hasPushedBackGuardRef.current = false;
      allowBrowserBackRef.current = false;
    }

    return () => {
      sessionStorage.removeItem(ADD_ROUND_DIRTY_KEY);
    };
  }, [isRoundAddDirty]);

  // Warn user before refreshing/closing only when there are unsaved changes
  useEffect(() => {
    if (!isRoundAddDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRoundAddDirty]);

  useEffect(() => {
    if (!isRoundAddDirty) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;

      const nextUrl = new URL(anchor.href, window.location.origin);
      if (nextUrl.origin !== window.location.origin) return;
      if (nextUrl.pathname === pathname && nextUrl.search === window.location.search) return;

      event.preventDefault();
      confirmLeaveAddRound(() => {
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      });
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [confirmLeaveAddRound, isRoundAddDirty, pathname, router]);

  useEffect(() => {
    if (!isRoundAddDirty) return;
    if (!hasPushedBackGuardRef.current) {
      window.history.pushState({ golfiqAddRoundGuard: true }, '', window.location.href);
      hasPushedBackGuardRef.current = true;
    }

    const restoreGuard = () => {
      window.history.pushState({ golfiqAddRoundGuard: true }, '', window.location.href);
    };

    const handlePopState = () => {
      if (allowBrowserBackRef.current) {
        return;
      }

      showConfirm({
        title: 'Discard changes?',
        message: 'You have unsaved round details.',
        cancelText: 'Stay',
        confirmText: 'Discard',
        variant: 'warning',
        confirmVariant: 'danger',
        onCancel: restoreGuard,
        onConfirm: () => {
          clearRoundDraft();
          clearAddRoundDirtyState();
          allowBrowserBackRef.current = true;
          window.history.back();
        },
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clearAddRoundDirtyState, clearRoundDraft, isRoundAddDirty, showConfirm]);

  useEffect(() => {
    const handlePageHide = () => {
      persistDraftAndResumeContext();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        persistDraftAndResumeContext();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [persistDraftAndResumeContext]);

  // One-time, ephemeral location lookup used only to sort nearby course search results.
  useEffect(() => {
    if (status !== 'authenticated' || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // Course search still works without proximity sorting.
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 8000,
      },
    );
  }, [status]);

  // Fetch user profile for default tee preference
  useEffect(() => {
    if (status === 'authenticated') {
      const fetchUserProfile = async () => {
        try {
          const res = await fetch('/api/users/profile');
          const data = await res.json();
          if (data.type === 'success' && data.profile) {
            userProfileRef.current = {
              default_tee: data.profile.default_tee,
              gender: data.profile.gender,
              live_round_track_fir: data.profile.live_round_track_fir,
              live_round_track_gir: data.profile.live_round_track_gir,
              live_round_track_chips: data.profile.live_round_track_chips,
              live_round_track_greenside_bunker_shots: data.profile.live_round_track_greenside_bunker_shots,
              live_round_track_putts: data.profile.live_round_track_putts,
              live_round_track_penalties: data.profile.live_round_track_penalties,
            };
            if (!liveRoundTrackingReadyRef.current) {
              setLiveRoundTracking(profileFieldsToLiveRoundTrackingPrefs(data.profile));
              liveRoundTrackingReadyRef.current = true;
            }
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      };
      fetchUserProfile();
    }
  }, [status]);

  const sanitizeNumeric = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/\D/g, '');
  };

  const setRoundTag = (next: RoundContext) => {
    markUserEdited();
    setRound((prev) => ({ ...prev, round_context: next }));
    setShowRoundTagPicker(false);
  };

  const roundTagLabel = round.round_context === 'simulator' ? 'Simulator' : 'Practice';

  const deriveShortGameShots = (chips: number | null | undefined, greensideBunkerShots: number | null | undefined) => {
    if (chips == null && greensideBunkerShots == null) return null;
    return (chips ?? 0) + (greensideBunkerShots ?? 0);
  };

  const buildPayload = () => {
    const payload: any = {
      ...round,
      course_id: Number(round.course_id),
      tee_id: Number(round.tee_id),
      round_context: round.round_context,
      tee_segment: round.tee_segment,
      hole_by_hole: 0,
    };
    ['fir_hit', 'gir_hit', 'putts', 'penalties', 'chips', 'greenside_bunker_shots'].forEach(
      (f) => (payload[f] = round[f as keyof Round]),
    );
    payload.short_game_shots = deriveShortGameShots(round.chips, round.greenside_bunker_shots);
    return payload;
  };

  const loadCourseOptions = async (
    search: string,
    loadedOptions: any,
    { page }: { page: number } = { page: 1 } // default if undefined
  ) => {
    try {
      const locationParam = userLocation
        ? `&lat=${userLocation.lat}&lng=${userLocation.lng}`
        : '';
      const res = await fetch(
        `/api/courses?search=${encodeURIComponent(search)}&limit=20&page=${page}${locationParam}`
      );
      const data = await res.json();
      const coursesArray = data.courses || [];

      return {
        options: coursesArray.map((course: any) => {
          const courseName = course.club_name == course.course_name ? course.course_name : course.club_name + ' - ' + course.course_name;
          const location = course.location;
          const city = location?.city || '';
          const state = location?.state || '';
          const locationString = city && state ? ` (${city}, ${state})` : '';
          return {
            label: courseName + locationString,
            value: course.id,
          };
        }),
        hasMore: coursesArray.length === 20,
        additional: { page: page + 1 },
      };
    } catch (err) {
      console.error(err);
      return { options: [], hasMore: false, additional: { page: page + 1 } };
    }
  };

  const loadTeeOptions = async (
    search: string,
    loadedOptions: any,
    { page }: { page: number } = { page: 1 },
    courseId?: number
  ) => {
    if (!courseId)
      return { options: [], hasMore: false, additional: { page: 1 } };

    try {
      const res = await fetch(
        `/api/tees?course_id=${courseId}&search=${encodeURIComponent(
          search
        )}&limit=20&page=${page}`
      );
      const data = await res.json();
      const teesArray: any[] = data.tees || [];

      // Group tees by gender
      const grouped: GroupBase<TeeOption>[] = Object.entries(
        teesArray.reduce((acc: Record<string, TeeOption[]>, tee: any) => {
          const genderKey =
            tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1).toLowerCase();
          if (!acc[genderKey]) acc[genderKey] = [];
          acc[genderKey].push({
            label: `${tee.tee_name} ${tee.total_yards ?? 0} yd (${
              tee.course_rating ?? 0
            }/${tee.slope_rating ?? 0}) ${tee.number_of_holes ?? 0} holes`,
            value: tee.id,
            teeObj: tee, // optional, keep full tee object
          });
          return acc;
        }, {})
      ).map(([label, options]) => ({
        label,
        options, // <-- now typed as TeeOption[]
      }));

      return { options: grouped, hasMore: false, additional: { page: page + 1 } };
    } catch (err) {
      console.error(err);
      return { options: [], hasMore: false, additional: { page: page + 1 } };
    }
  };

  const fetchTees = useCallback(async (courseId: number) => {
    if (!courseId) return [];
    try {
      const res = await fetch(`/api/tees?course_id=${courseId}`);
      const data = await res.json();
      return data.tees || [];
    } catch (err) {
      console.error(err);
      showMessage('Error fetching tees.', 'error');
      return [];
    }
  }, [showMessage]);

  const autoSelectTee = useCallback((teesArray: any[]) => {
    const profile = userProfileRef.current;
    if (!profile || teesArray.length === 0) {
      return;
    }

    const { default_tee, gender } = profile;

    // If no gender is set, default to 'male' for tee selection
    const effectiveGender = gender || 'male';

    // Define tee order (longest to shortest)
    const teeOrder = ['black', 'gold', 'blue', 'white', 'red'];
    const defaultIndex = default_tee ? teeOrder.indexOf(default_tee.toLowerCase()) : -1;

    let matchedTee = null;

    // 1. Try exact match (name + gender)
    if (default_tee) {
      matchedTee = teesArray.find((t: any) =>
        t.tee_name?.toLowerCase() === default_tee.toLowerCase() &&
        t.gender?.toLowerCase() === effectiveGender.toLowerCase()
      );
    }

    // 2. Try matching just the tee name (any gender)
    if (!matchedTee && default_tee) {
      matchedTee = teesArray.find((t: any) =>
        t.tee_name?.toLowerCase() === default_tee.toLowerCase()
      );
    }

    // 3. If default tee not available, find next longer tee (lower index) for gender
    if (!matchedTee && defaultIndex !== -1) {
      // Try longer tees first (lower index = longer course)
      for (let i = defaultIndex - 1; i >= 0; i--) {
        matchedTee = teesArray.find((t: any) =>
          t.tee_name?.toLowerCase() === teeOrder[i] &&
          t.gender?.toLowerCase() === effectiveGender.toLowerCase()
        );
        if (matchedTee) break;
      }

      // If no longer tee found, try shorter tees
      if (!matchedTee) {
        for (let i = defaultIndex + 1; i < teeOrder.length; i++) {
          matchedTee = teesArray.find((t: any) =>
            t.tee_name?.toLowerCase() === teeOrder[i] &&
            t.gender?.toLowerCase() === effectiveGender.toLowerCase()
          );
          if (matchedTee) break;
        }
      }

      // If still no match with effectiveGender, try without gender filter
      if (!matchedTee) {
        for (let i = defaultIndex - 1; i >= 0; i--) {
          matchedTee = teesArray.find((t: any) =>
            t.tee_name?.toLowerCase() === teeOrder[i]
          );
          if (matchedTee) break;
        }
      }

      if (!matchedTee) {
        for (let i = defaultIndex + 1; i < teeOrder.length; i++) {
          matchedTee = teesArray.find((t: any) =>
            t.tee_name?.toLowerCase() === teeOrder[i]
          );
          if (matchedTee) break;
        }
      }
    }

    // 4. Ultimate fallback - just pick first available tee
    if (!matchedTee && teesArray.length > 0) {
      matchedTee = teesArray[0];
    }

    // Auto-select the matched tee
    if (matchedTee) {
      setRound((prev) => ({ ...prev, tee_id: String(matchedTee.id) }));
      setSelectedTee({
        value: matchedTee.id,
        label: `${matchedTee.tee_name} ${matchedTee.total_yards ?? 0} yd (${matchedTee.course_rating ?? 0}/${matchedTee.slope_rating ?? 0}) ${matchedTee.number_of_holes ?? 0} holes`,
        teeObj: matchedTee,
      });
      updateSegmentOptions(matchedTee);

      // Set par_total from the matched tee
      if (matchedTee.par_total) {
        setRound((prev) => ({ ...prev, par_total: matchedTee.par_total }));
      }
    }
  }, [updateSegmentOptions]);

  const fetchHoles = useCallback(async (teeId: number, existingRoundHoles: any[] = [], segment?: TeeSegment) => {
    if (!teeId) return [];
    try {
      const res = await fetch(`/api/tees/${teeId}/holes`);
      const data = await res.json();

      const holesArray = data.holes || [];
      setHoles(holesArray);
      const sourceRoundHoles = existingRoundHoles.length > 0 ? existingRoundHoles : holeScoresRef.current;

      let initScores: HoleScore[];

      if (segment === 'double9') {
        // Use only real holes 1-9 (filter out any legacy synthetic holes 10+)
        const realHoles = holesArray.filter((h: any) => h.hole_number <= 9);
        // Create 18 entries: pass=1 for holes 1-9, pass=2 for holes 10-18 (same hole IDs)
        const pass1 = realHoles.map((hole: any) => {
          const existing = sourceRoundHoles.find((h: any) => h.hole_id === hole.id && h.pass === 1);
          return {
            hole_id: hole.id,
            hole_number: hole.hole_number,
            pass: 1,
            par: hole.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            fir_direction: existing?.fir_direction ?? null,
            gir_hit: existing?.gir_hit ?? null,
            gir_direction: existing?.gir_direction ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
            chips: existing?.chips ?? null,
            greenside_bunker_shots: existing?.greenside_bunker_shots ?? null,
          };
        });
        const pass2 = realHoles.map((hole: any) => {
          const existing = sourceRoundHoles.find((h: any) => h.hole_id === hole.id && h.pass === 2);
          return {
            hole_id: hole.id,
            hole_number: hole.hole_number + 9,
            pass: 2,
            par: hole.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            fir_direction: existing?.fir_direction ?? null,
            gir_hit: existing?.gir_hit ?? null,
            gir_direction: existing?.gir_direction ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
            chips: existing?.chips ?? null,
            greenside_bunker_shots: existing?.greenside_bunker_shots ?? null,
          };
        });
        initScores = [...pass1, ...pass2];
      } else {
        initScores = holesArray.map((hole: any) => {
          const existing = sourceRoundHoles.find((h: any) => h.hole_id === hole.id);
          return {
            hole_id: hole.id,
            hole_number: hole.hole_number,
            pass: 1,
            par: hole.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            fir_direction: existing?.fir_direction ?? null,
            gir_hit: existing?.gir_hit ?? null,
            gir_direction: existing?.gir_direction ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
            chips: existing?.chips ?? null,
            greenside_bunker_shots: existing?.greenside_bunker_shots ?? null,
          };
        });
      }

      setHoleScores(initScores);
      return holesArray;
    } catch (err) {
      console.error(err);
      showMessage('Error fetching holes.', 'error');
      return [];
    }
  }, [showMessage]);

  // Initialize from URL params
  useEffect(() => {
    if (status !== 'authenticated' || initialized) return;

    const initAddRound = async () => {
      const courseId = searchParams?.get('courseId');
      const teeId = searchParams?.get('teeId');
      const courseName = searchParams?.get('courseName');

      if (courseId) {
        setRound((prev) => ({ ...prev, course_id: String(courseId) }));
        setSelectedCourse({ label: courseName || '', value: Number(courseId) });

        const fetchedTees = await fetchTees(Number(courseId));

        if (teeId) {
          // Use tee from URL (coming from course details page)
          const foundTee = fetchedTees.find((t: any) => t.id === Number(teeId));
          if (foundTee) {
            setRound((prev) => ({ ...prev, tee_id: String(teeId) }));
            setSelectedTee({
              value: foundTee.id,
              label: `${foundTee.tee_name} ${foundTee.total_yards ?? 0} yd (${foundTee.course_rating ?? 0}/${foundTee.slope_rating ?? 0}) ${foundTee.number_of_holes ?? 0} holes`,
              teeObj: foundTee,
            });
            updateSegmentOptions(foundTee);

            const holesData = await fetchHoles(Number(teeId), []);
            const totalPar = holesData.reduce((sum: number, h: any) => sum + (h.par ?? 0), 0);
            setRound((prev) => ({ ...prev, par_total: totalPar }));
          }
        } else if (fetchedTees.length > 0) {
          // Auto-select tee based on user profile
          autoSelectTee(fetchedTees);
        }
      }
      setInitialized(true);
    };

    initAddRound();
  }, [status, initialized, searchParams, fetchTees, fetchHoles, autoSelectTee, updateSegmentOptions]);

  // Fetch holes when tee changes
  useEffect(() => {
    if (!round.tee_id || !initialized) return;
    if (restoredDraftRef.current) {
      restoredDraftRef.current = false;
      return;
    }

    const initHoles = async () => {
      await fetchHoles(Number(round.tee_id), holeScoresRef.current, round.tee_segment);
    };

    initHoles();
  }, [round.tee_id, round.tee_segment, initialized, fetchHoles]);

  // Calculate max FIR (non-par-3 holes) and max GIR (total holes) — segment-aware
  const maxFir = useMemo(() => {
    if (selectedTee?.teeObj) {
      try {
        const resolver = apiTeeToResolver(selectedTee.teeObj);
        const ctx = resolveTeeContext(resolver, round.tee_segment);
        return ctx.nonPar3Holes;
      } catch { /* fall through */ }
    }
    if (holes.length === 0) return 14;
    return holes.filter((h: any) => h.par !== 3).length;
  }, [holes, selectedTee, round.tee_segment]);

  const maxGir = useMemo(() => {
    if (selectedTee?.teeObj) {
      try {
        const resolver = apiTeeToResolver(selectedTee.teeObj);
        const ctx = resolveTeeContext(resolver, round.tee_segment);
        return ctx.holes;
      } catch { /* fall through */ }
    }
    if (holes.length === 0) return 18;
    return holes.length;
  }, [holes, selectedTee, round.tee_segment]);

  // Filter holeScores based on current segment's holeRange
  const filteredHoleScores = useMemo(() => {
    if (!selectedTee?.teeObj || holeScores.length === 0) return holeScores;
    try {
      const resolver = apiTeeToResolver(selectedTee.teeObj);
      const ctx = resolveTeeContext(resolver, round.tee_segment);
      const holeRange = new Set(ctx.holeRange);
      return holeScores.filter(hs => holeRange.has(hs.hole_number));
    } catch {
      return holeScores;
    }
  }, [holeScores, selectedTee, round.tee_segment]);

  const liveStartHoleOptions = useMemo(() => {
    if (selectedTee?.teeObj) {
      try {
        const resolver = apiTeeToResolver(selectedTee.teeObj);
        const ctx = resolveTeeContext(resolver, round.tee_segment);
        const holeNumbers = round.tee_segment === 'double9'
          ? Array.from({ length: 18 }, (_, index) => index + 1)
          : ctx.holeRange;
        return holeNumbers.map((holeNumber) => ({
          value: holeNumber,
          label: `Hole ${holeNumber}`,
        }));
      } catch { /* fall through */ }
    }

    return filteredHoleScores.map((hole) => ({
      value: hole.hole_number,
      label: `Hole ${hole.hole_number}`,
    }));
  }, [filteredHoleScores, round.tee_segment, selectedTee]);

  useEffect(() => {
    if (liveStartHoleOptions.length === 0) return;
    if (liveStartHoleOptions.some((option) => option.value === liveStartHoleNumber)) return;
    setLiveStartHoleNumber(liveStartHoleOptions[0].value);
  }, [liveStartHoleNumber, liveStartHoleOptions]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    markUserEdited();
    const { name, value } = e.target;

    if (['score', 'fir_hit', 'gir_hit', 'putts', 'penalties', 'chips', 'greenside_bunker_shots'].includes(name)) {
      const numericValue = sanitizeNumeric(value);

      const maxMap: Record<string, number> = {
        fir_hit: maxFir,
        gir_hit: maxGir,
        score: 150,
        putts: 99,
        penalties: 30,
        chips: 99,
        greenside_bunker_shots: 99,
      };

      let clampedValue =
        numericValue === ''
          ? ''
          : Math.min(Number(numericValue), maxMap[name]);

      setRound((prev) => ({
        ...prev,
        [name]: clampedValue === '' ? null : Number(clampedValue),
      }));
    } else {
      setRound((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleHoleScoreChange = (index: number, field: string, value: any) => {
    markUserEdited();
    setHoleScores((prev) => {
      const updated = [...prev];
      const hole = updated[index];

      const nextHole = {
        ...hole,
        [field]: value,
      } as HoleScore;

      if (field === 'fir_hit' && value !== 0) {
        nextHole.fir_direction = null;
      }
      if (field === 'gir_hit' && value !== 0) {
        nextHole.gir_direction = null;
      }
      if (field === 'fir_direction' && hole.fir_hit !== 0) {
        nextHole.fir_direction = null;
      }
      if (field === 'gir_direction' && hole.gir_hit !== 0) {
        nextHole.gir_direction = null;
      }

      updated[index] = nextHole;

      return updated;
    });
  };

  const handleToggleExpand = (holeNumber: number) => {
    setExpandedHole((prev) => (prev === holeNumber ? -1 : holeNumber));
  };

  const handleNext = (currentFilteredIndex: number) => {
    const currentHoleNumber = filteredHoleScores[currentFilteredIndex].hole_number;
    setCompletedHoles((prev) => new Set(prev).add(currentHoleNumber));

    if (currentFilteredIndex < filteredHoleScores.length - 1) {
      const nextHoleNumber = filteredHoleScores[currentFilteredIndex + 1].hole_number;
      setExpandedHole(nextHoleNumber);
    } else {
      setExpandedHole(-1);
    }
  };

  const toggleHoleByHole = async () => {
    markUserEdited();
    const newHBH = round.hole_by_hole === 1 ? 0 : 1;
    trackEvent(ANALYTICS_EVENTS.roundLoggingModeSelected, {
      from_mode: round.hole_by_hole === 1 ? 'live_round' : 'after_round',
      to_mode: newHBH === 1 ? 'live_round' : 'after_round',
    });

    if (newHBH === 1) {
      // Switching to completed hole-by-hole scorecard entry
      // Validate that a tee is selected
      if (!round.tee_id) {
        showMessage('Please select a tee before enabling hole-by-hole scorecard entry.', 'error');
        return;
      }

      // Ensure holes are fetched if we have a tee selected
      let currentHoles = holes;
      if (holes.length === 0) {
        currentHoles = await fetchHoles(Number(round.tee_id), holeScoresRef.current, round.tee_segment);
      }

      // Check if we actually got holes
      if (currentHoles.length === 0) {
        showMessage('No holes found for this tee. Please try selecting a different tee.', 'error');
        return;
      }

      // Only re-initialize holeScores if fetchHoles wasn't just called
      // (fetchHoles already sets holeScores internally)
      if (holes.length > 0) {
        let fresh: HoleScore[];
        if (round.tee_segment === 'double9') {
          // Filter to real holes 1-9 only (exclude any synthetic holes 10+)
          const realHoles = currentHoles.filter((h: any) => h.hole_number <= 9);
          const pass1 = realHoles.map((h: any) => {
            const existing = holeScores.find((hs) => hs.hole_id === h.id && hs.pass === 1);
            return {
              hole_id: h.id,
              hole_number: h.hole_number,
              pass: 1,
              par: h.par,
              score: existing?.score ?? null,
              fir_hit: existing?.fir_hit ?? null,
              fir_direction: existing?.fir_direction ?? null,
              gir_hit: existing?.gir_hit ?? null,
              gir_direction: existing?.gir_direction ?? null,
              putts: existing?.putts ?? null,
              penalties: existing?.penalties ?? null,
              chips: existing?.chips ?? null,
              greenside_bunker_shots: existing?.greenside_bunker_shots ?? null,
            };
          });
          const pass2 = realHoles.map((h: any) => {
            const existing = holeScores.find((hs) => hs.hole_id === h.id && hs.pass === 2);
            return {
              hole_id: h.id,
              hole_number: h.hole_number + 9,
              pass: 2,
              par: h.par,
              score: existing?.score ?? null,
              fir_hit: existing?.fir_hit ?? null,
              fir_direction: existing?.fir_direction ?? null,
              gir_hit: existing?.gir_hit ?? null,
              gir_direction: existing?.gir_direction ?? null,
              putts: existing?.putts ?? null,
              penalties: existing?.penalties ?? null,
              chips: existing?.chips ?? null,
              greenside_bunker_shots: existing?.greenside_bunker_shots ?? null,
            };
          });
          fresh = [...pass1, ...pass2];
        } else {
          fresh = currentHoles.map((h: any) => {
            const existing = holeScores.find((hs) => hs.hole_id === h.id);
            return {
              hole_id: h.id,
              hole_number: h.hole_number,
              pass: 1,
              par: h.par,
              score: existing?.score ?? null,
              fir_hit: existing?.fir_hit ?? null,
              fir_direction: existing?.fir_direction ?? null,
              gir_hit: existing?.gir_hit ?? null,
              gir_direction: existing?.gir_direction ?? null,
              putts: existing?.putts ?? null,
              penalties: existing?.penalties ?? null,
              chips: existing?.chips ?? null,
              greenside_bunker_shots: existing?.greenside_bunker_shots ?? null,
            };
          });
        }
        setHoleScores(fresh);
      }
      liveRoundTrackingReadyRef.current = true;
      // Keep the current score when switching to HBH mode instead of nulling it
      setRound((prev) => ({ ...prev, hole_by_hole: 1 }));
    } else {
      // Switching from completed hole-by-hole scorecard entry
      setRound((prev) => ({
        ...prev,
        hole_by_hole: 0,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    if (!round.date || !round.course_id || !round.tee_id) {
      showMessage('Date, Course, and Tee are required.', 'error');
      return;
    }

    if (round.score === null || round.score === undefined) {
      showMessage('Score is required in After Round mode.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/rounds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await res.json();
      if (!res.ok) {
        trackEvent(ANALYTICS_EVENTS.apiRequestFailed, {
          endpoint: '/api/rounds',
          method: 'POST',
          status_code: res.status,
          feature_area: 'round_add',
        });
        throw new Error(data.message || 'Error saving round');
      }

      hasSubmittedRef.current = true;
      clearRoundDraft();
      clearAddRoundDirtyState();

      markInsightsNudgePending();
      markRoundInsightsRefreshPending(String(data.roundId));

      // Keep loading state true during navigation to prevent flash
      // Replace history so back button goes to rounds page, not add page
      router.replace(`/rounds/${data.roundId}/stats?from=rounds`);
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error saving round', 'error');
      setLoading(false);
    }
  };

  const handleStartLiveRound = async () => {
    clearMessage();
    setLiveStartError(null);

    if (status !== 'authenticated') {
      router.replace('/login');
      return;
    }

    if (!round.date || !round.course_id || !round.tee_id) {
      const message = 'Date, Course, and Tee are required to start a live round.';
      setLiveStartError(message);
      showMessage(message, 'error');
      return;
    }

    setStartingLiveRound(true);
    try {
      if (liveGpsEnabled && !liveGpsTestLocationEnabled) {
        const gpsFix = await requestLiveRoundGpsPermission();
        if (gpsFix) setUserLocation(gpsFix.position);
      }

      const startHoleNumber = liveStartHoleOptions.some((option) => option.value === liveStartHoleNumber)
        ? liveStartHoleNumber
        : liveStartHoleOptions[0]?.value;

      const response = await fetch('/api/rounds/live/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_id: Number(round.course_id),
          tee_id: Number(round.tee_id),
          date: round.date,
          tee_segment: round.tee_segment,
          start_hole_number: startHoleNumber,
          gpsEnabled: liveGpsEnabled,
          tracking_prefs: {
            fir: liveRoundTracking.fir,
            gir: liveRoundTracking.gir,
            chips: liveRoundTracking.chips,
            greenside_bunker_shots: liveRoundTracking.greensideBunkerShots,
            putts: liveRoundTracking.putts,
            penalties: liveRoundTracking.penalties,
          },
        }),
      });

      const data = await readApiResponse<{ session: LiveRoundSession }>(response);
      hasSubmittedRef.current = true;
      clearRoundDraft();
      clearAddRoundDirtyState();
      const liveRoundPath = `/rounds/live/${data.session.id}`;
      router.push(
        liveGpsEnabled && liveGpsTestLocationEnabled
          ? `${liveRoundPath}?gpsTestLocation=1`
          : liveRoundPath,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start live round';
      setLiveStartError(message);
      showMessage(message, 'error');
      setStartingLiveRound(false);
    }
  };

  const handleDiscardLiveSession = (liveSession: LiveRoundSession) => {
    const courseLabel = sessionCourseLabel(liveSession);
    showConfirm({
      title: 'Discard live round?',
      message: `This removes ${courseLabel} from your resume list. This cannot be undone.`,
      cancelText: 'Keep Round',
      confirmText: 'Discard',
      variant: 'danger',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setDiscardingLiveSessionId(liveSession.id);
        setLiveStartError(null);
        try {
          const response = await fetch(`/api/rounds/live/sessions/${liveSession.id}/discard`, {
            method: 'POST',
          });
          await readApiResponse<{ session: LiveRoundSession }>(response);
          setActiveLiveSessions((current) => current.filter((sessionItem) => sessionItem.id !== liveSession.id));
          setShowLiveStartSetup(true);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to discard live round';
          setLiveStartError(message);
          showMessage(message, 'error');
        } finally {
          setDiscardingLiveSessionId(null);
        }
      },
    });
  };

  const formatValue = (val: number | null | undefined) => (val === null || val === undefined ? '' : val);

  const calculateTotals = () => {
    const totals = {
      score: 0,
      par: 0,
      fir_hit: 0,
      gir_hit: 0,
      putts: 0,
      penalties: 0,
      chips: 0,
      greenside_bunker_shots: 0,
    };
    let hasScore = false;
    let hasFir = false, hasGir = false, hasPutts = false, hasPenalties = false, hasChips = false, hasBunker = false;

    filteredHoleScores.forEach((h) => {
      if (h.score !== null) {
        totals.score += h.score;
        hasScore = true;
      }
      if (h.par !== null) totals.par += h.par;
      if (h.fir_hit !== null) {
        totals.fir_hit += h.fir_hit;
        hasFir = true;
      }
      if (h.gir_hit !== null) {
        totals.gir_hit += h.gir_hit;
        hasGir = true;
      }
      if (h.putts !== null) {
        totals.putts += h.putts;
        hasPutts = true;
      }
      if (h.penalties !== null) {
        totals.penalties += h.penalties;
        hasPenalties = true;
      }
      if (h.chips !== null) {
        totals.chips += h.chips;
        hasChips = true;
      }
      if (h.greenside_bunker_shots !== null) {
        totals.greenside_bunker_shots += h.greenside_bunker_shots;
        hasBunker = true;
      }
    });

    const totalChips = hasChips ? totals.chips : null;
    const totalGreensideBunkerShots = hasBunker ? totals.greenside_bunker_shots : null;
    const totalShortGameShots =
      totalChips == null && totalGreensideBunkerShots == null
        ? null
        : (totalChips ?? 0) + (totalGreensideBunkerShots ?? 0);

    return {
      score: hasScore ? totals.score : null,
      par: totals.par || null,
      fir_hit: hasFir ? totals.fir_hit : null,
      gir_hit: hasGir ? totals.gir_hit : null,
      putts: hasPutts ? totals.putts : null,
      penalties: hasPenalties ? totals.penalties : null,
      chips: totalChips,
      greenside_bunker_shots: totalGreensideBunkerShots,
      short_game_shots: totalShortGameShots,
    };
  };

  const renderHoleCards = () => {
    if (!isHBH || !initialized) return null;

    if (filteredHoleScores.length === 0) {
      return <div className="card">Please wait while holes are loading...</div>;
    }

    const totals = calculateTotals();
    const show = (v: number | null) => (v === null ? '–' : v);

    return (
      <div>
        {filteredHoleScores.map((h, filteredIdx) => {
          const actualIdx = holeScores.findIndex(hs => hs.hole_id === h.hole_id && hs.pass === h.pass);
          const isExpanded = expandedHole === h.hole_number;
          const isCompleted = completedHoles.has(h.hole_number);

          return (
            <div
              key={`${h.hole_id}-${h.pass}`}
              ref={(el) => {
                holeCardRefs.current[h.hole_number] = el;
              }}
            >
              <HoleCard
                hole={h.hole_number}
                par={h.par}
                score={h.score}
                fir_hit={h.fir_hit}
                fir_direction={h.fir_direction}
                gir_hit={h.gir_hit}
                gir_direction={h.gir_direction}
                putts={h.putts}
                penalties={h.penalties}
                chips={h.chips}
                greenside_bunker_shots={h.greenside_bunker_shots}
                trackingPrefs={liveRoundTracking}
                isExpanded={isExpanded}
                isCompleted={isCompleted}
                onChange={(_, field, value) => handleHoleScoreChange(actualIdx, field, value)}
                onToggleExpand={handleToggleExpand}
                onNext={() => handleNext(filteredIdx)}
              />
            </div>
          );
        })}

        {filteredHoleScores.length > 0 && (
          <div className="card hole-card-total">
            <div className="hole-header">Totals</div>
            <div className="hole-card-grid">
              <div className="hole-field">
                <strong>Par</strong> {show(totals.par)}
              </div>
              <div className="hole-field">
                <strong>Score</strong> {show(totals.score)}
              </div>
              {liveRoundTracking.fir && (
                <div className="hole-field">
                  <strong>FIR</strong> {show(totals.fir_hit)}
                </div>
              )}
              {liveRoundTracking.gir && (
                <div className="hole-field">
                  <strong>GIR</strong> {show(totals.gir_hit)}
                </div>
              )}
              {liveRoundTracking.chips && (
                <div className="hole-field">
                  <strong>Chips</strong> {show(totals.chips)}
                </div>
              )}
              {liveRoundTracking.greensideBunkerShots && (
                <div className="hole-field">
                  <strong>Bunker</strong> {show(totals.greenside_bunker_shots)}
                </div>
              )}
              {liveRoundTracking.putts && (
                <div className="hole-field">
                  <strong>Putts</strong> {show(totals.putts)}
                </div>
              )}
              {liveRoundTracking.penalties && (
                <div className="hole-field">
                  <strong>Penalties</strong> {show(totals.penalties)}
                </div>
              )}
              {(liveRoundTracking.chips || liveRoundTracking.greensideBunkerShots) && (
                <div className="hole-field">
                  <strong>Short Game</strong> {show(totals.short_game_shots)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderActiveLiveSessions = () => {
    if (loadingLiveSessions) {
      return <p className="live-round-muted">Checking for active live rounds...</p>;
    }

    if (activeLiveSessions.length === 0) {
      return null;
    }

    const hasMultipleSessions = activeLiveSessions.length > 1;
    const description = hasMultipleSessions
      ? 'Choose a round to continue.'
      : 'Pick up where you left off.';

    return (
      <div className="card live-round-add-panel">
        <div className="live-round-section-title">
          <div>
            <h2>Continue Live Round</h2>
            <p className="live-round-muted">{description}</p>
          </div>
        </div>

        <div className="live-round-session-list">
          {activeLiveSessions.map((liveSession) => {
            const isDiscarding = discardingLiveSessionId === liveSession.id;

            return (
              <div className="live-round-session-row" key={liveSession.id}>
                <div>
                  <strong>{sessionCourseLabel(liveSession)}</strong>
                  <span>
                    <CalendarDays size={14} />
                    {formatSessionDate(liveSession.date)}
                    {' '}
                    {liveSession.tee?.tee_name || 'Selected Tee'}
                    {' '}
                    {teeSegmentLabel(liveSession.tee_segment, liveSession.tee?.number_of_holes)}
                  </span>
                  <span>
                    <Clock size={14} />
                    {formatSavedTime(liveSession.last_saved_at)}
                  </span>
                  {liveSession.active_hole_number && (
                    <span>Hole {liveSession.active_hole_number}</span>
                  )}
                </div>
                <div className="live-round-session-actions">
                  <button
                    type="button"
                    className="btn btn-edit live-round-session-icon-button live-round-resume-button"
                    onClick={() => confirmLeaveAddRound(() => router.push(`/rounds/live/${liveSession.id}`))}
                    disabled={isDiscarding}
                    aria-label="Continue live round"
                    title="Continue live round"
                  >
                    <Play size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-cancel live-round-session-icon-button live-round-discard-button"
                    onClick={() => handleDiscardLiveSession(liveSession)}
                    disabled={isDiscarding}
                    aria-label={isDiscarding ? 'Discarding live round' : 'Discard live round'}
                    title={isDiscarding ? 'Discarding live round' : 'Discard live round'}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!showLiveStartSetup && (
          <button
            type="button"
            className="btn btn-accent live-round-start-new-button"
            onClick={() => setShowLiveStartSetup(true)}
          >
            Start New Live Round
          </button>
        )}
      </div>
    );
  };

  const renderLiveRoundSetup = () => {
    return (
      <>
        {liveStartError && <div className="live-round-alert is-error">{liveStartError}</div>}
        {renderActiveLiveSessions()}
      </>
    );
  };

  if (status === 'loading') return null;
  const showLiveStartAction = roundEntryMode === 'live' && (showLiveStartSetup || activeLiveSessions.length === 0);
  const afterRoundEntryReady = isAfterRoundMode && Boolean(selectedTee);
  const showRoundDetailsFields = afterRoundEntryReady;
  const renderRoundTypeField = () => {
    if (segmentOptions.length <= 1) return null;

    return (
      <div className="form-row">
        <label className="form-label">Round Type</label>
        <Select
          value={segmentOptions.find(o => o.value === round.tee_segment) || segmentOptions[0]}
          options={segmentOptions}
          onChange={async (option: any) => {
            markUserEdited();
            if (option) {
              const newSegment = option.value as TeeSegment;
              if (selectedTee?.teeObj) {
                try {
                  const resolver = apiTeeToResolver(selectedTee.teeObj);
                  const ctx = resolveTeeContext(resolver, newSegment);
                  setRound(prev => ({ ...prev, tee_segment: newSegment, par_total: ctx.parTotal }));
                } catch {
                  setRound(prev => ({ ...prev, tee_segment: newSegment }));
                }
              } else {
                setRound(prev => ({ ...prev, tee_segment: newSegment }));
              }
              // Re-fetch holes (double9 duplicates client-side)
              if (round.tee_id) {
                await fetchHoles(Number(round.tee_id), holeScoresRef.current, newSegment);
              }
            }
          }}
          styles={selectStyles}
          isSearchable={false}
        />
      </div>
    );
  };

  return (
    <div className="page-stack">
      <div className='card'>
        <form
          onSubmit={(event) => {
            if (roundEntryMode === 'live') {
              event.preventDefault();
              if (!showLiveStartAction) {
                setShowLiveStartSetup(true);
                return;
              }
              handleStartLiveRound();
              return;
            }
            handleSubmit(event);
          }}
          className="form"
        >
          <div className="form-row">
            <label className="form-label">Date</label>
            <input
              type="date"
              name="date"
              value={round.date}
              onChange={handleChange}
              className="form-input"
              required
            />
          </div>

          <div className="form-row">
            <label className="form-label">Course</label>
            <div className="round-form-course-row">
              <div className="round-form-course-select">
                <AsyncPaginate
                  value={selectedCourse}
                  loadOptions={loadCourseOptions}
                  onChange={async (option) => {
                    markUserEdited();
                    setSelectedCourse(option);
                    setLiveGpsEnabled(false);
                    setLiveGpsTestLocationEnabled(false);
                    setLiveGpsAvailability(null);
                    setSelectedTee(null);
                    setSegmentOptions([]);
                    setLiveStartHoleNumber(1);
                    setRound((prev) => ({
                      ...prev,
                      course_id: option?.value.toString() ?? '',
                      tee_id: '',
                      tee_segment: 'full',
                      par_total: null,
                    }));
                    setHoles([]);
                    setHoleScores([]);

                    // Fetch tees and auto-select based on user profile
                    if (option?.value) {
                      const fetchedTees = await fetchTees(option.value);
                      if (fetchedTees.length > 0) {
                        autoSelectTee(fetchedTees);
                      }
                    }
                  }}
                  additional={{ page: 1 }}
                  placeholder="Select Course"
                  isClearable
                  styles={courseSelectStyles}
                  noOptionsMessage={() => "Course not found. Use + button to add course."}
                />
              </div>
              <button
                type="button"
                onClick={() => confirmLeaveAddRound(() => router.push('/courses/search'))}
                className="btn btn-accent btn-add-course"
                title="Search Global Database"
              >
                <Plus/>
              </button>
            </div>
          </div>

          {selectedCourse && (
            <div className="form-row">
              <label className="form-label">Tee</label>
              <AsyncPaginate
                key={selectedCourse.value}
                value={selectedTee}
                loadOptions={(search, loadedOptions, additional) =>
                  loadTeeOptions(search, loadedOptions, additional as { page: number }, selectedCourse.value)
                }
                onChange={async (option) => {
                  markUserEdited();
                  setSelectedTee(option);
                  const teeId = option?.value ?? '';
                  setRound((prev) => ({
                    ...prev,
                    tee_id: teeId.toString(),
                    par_total: teeId ? prev.par_total : null,
                  }));
                  updateSegmentOptions(option?.teeObj);

                  if (teeId) {
                    const holesData = await fetchHoles(teeId, []);
                    const totalPar = holesData.reduce((sum: number, h: any) => sum + (h.par ?? 0), 0);
                    setRound((prev) => ({ ...prev, par_total: totalPar }));
                  }
                }}
                placeholder="Select Tee"
                isClearable
                additional={{ page: 1 }}
                styles={selectStyles}
              />
            </div>
          )}

          {selectedTee && isAfterRoundMode && renderRoundTypeField()}

          {selectedTee && showLiveStartAction && (
            <>
              {renderRoundTypeField()}
              <div className="form-row">
                <label className="form-label">Starting Hole</label>
                <Select
                  value={
                    liveStartHoleOptions.find((option) => option.value === liveStartHoleNumber) ??
                    liveStartHoleOptions[0] ??
                    null
                  }
                  options={liveStartHoleOptions}
                  onChange={(option: any) => {
                    markUserEdited();
                    if (option) {
                      setLiveStartHoleNumber(option.value);
                    }
                  }}
                  styles={selectStyles}
                  isSearchable={false}
                  isDisabled={!selectedTee || liveStartHoleOptions.length === 0}
                />
              </div>
            </>
          )}

          {initialized && (
            <>
              <label className="form-label">Logging Mode</label>
              <div className="stats-tabs">
                <button
                  type="button"
                  className={`stats-tab ${roundEntryMode === 'live' ? 'active' : ''}`}
                  onClick={() => {
                    if (roundEntryMode !== 'live') {
                      markUserEdited();
                      setRoundEntryMode('live');
                    }
                  }}
                >
                  Live Round
                </button>
                <button
                  type="button"
                  className={`stats-tab ${roundEntryMode === 'after' ? 'active' : ''}`}
                  onClick={() => {
                    if (roundEntryMode !== 'after') {
                      markUserEdited();
                      setRoundEntryMode('after');
                    }
                  }}
                >
                  After Round
                </button>
              </div>
              <p className="combined-note">
                {roundEntryMode === 'live'
                  ? 'Track hole-by-hole while you play.'
                  : 'Enter totals after your round.'}
              </p>
            </>
          )}

          {roundEntryMode === 'live' && renderLiveRoundSetup()}

          {afterRoundEntryReady && (
            <div className="form-row">
              <label className="form-label">Par</label>
              <input type="text" value={round.par_total ?? ''} className="form-input" disabled />
            </div>
          )}

          {afterRoundEntryReady && (
            <div className="form-row">
              <label className="form-label">Score</label>
              <input
                type="text"
                pattern="[0-9]*"
                name="score"
                value={formatValue(round.score)}
                onChange={handleChange}
                onFocus={(e) => {
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                enterKeyHint="done"
                className="form-input"
                required
              />
            </div>
          )}

          {afterRoundEntryReady && (
            <p className="combined-note">Track at least 2 stats for stronger insights.</p>
          )}

          {afterRoundEntryReady &&
            ['fir_hit', 'gir_hit', 'chips', 'greenside_bunker_shots', 'putts', 'penalties'].map((field) => {
              const labelMap: Record<string, string> = {
                fir_hit: 'Fairways In Regulation',
                gir_hit: 'Greens In Regulation',
                chips: 'Chips',
                greenside_bunker_shots: 'Greenside Bunker Shots',
                putts: 'Putts',
                penalties: 'Penalties',
              };

              return (
                <div key={field} className="form-row">
                  <label className="form-label">{labelMap[field]}</label>
                  <input
                    type="text"
                    pattern="[0-9]*"
                    name={field}
                    value={formatValue(round[field as keyof Round] as number)}
                    onChange={handleChange}
                    onFocus={(e) => {
                      const len = e.target.value.length;
                      e.target.setSelectionRange(len, len);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    enterKeyHint="done"
                    className="form-input"
                  />
                </div>
              );
            })}

          {showRoundDetailsFields && (
            <>
              <div className="form-row">
                <div className="round-tag-control">
                  <div className="round-tag-inline">
                    {round.round_context === 'real' ? (
                      <button
                        type="button"
                        className="round-tag-trigger"
                        onClick={() => setShowRoundTagPicker((prev) => !prev)}
                      >
                        Tag +
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="round-tag-pill is-selected"
                        onClick={() => setShowRoundTagPicker((prev) => !prev)}
                      >
                        {roundTagLabel}
                      </button>
                    )}
                    {round.round_context !== 'real' && (
                      <button
                        type="button"
                        className="round-tag-clear"
                        onClick={() => setRoundTag('real')}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {showRoundTagPicker && (
                    <div className="round-tag-picker" role="group" aria-label="Round tag options">
                      {roundTagOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`round-tag-pill ${round.round_context === option.value ? 'is-selected' : ''}`}
                          onClick={() => setRoundTag(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {round.round_context !== 'real' && (
                  <p className="combined-note">Tagged rounds are excluded from handicap, leaderboard, and overall insights.</p>
                )}
              </div>

              <div className="form-row">
                <label className="form-label">Notes</label>
                <textarea
                  name="notes"
                  value={round.notes}
                  onChange={(e) => {
                    handleChange(e);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onFocus={(e) => {
                    const len = e.target.value.length;
                    e.target.setSelectionRange(len, len);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  rows={3}
                  className="form-input"
                  maxLength={500}
                  placeholder="Anything to remember from this round?"
                  wrap='soft'
                  enterKeyHint="done"
                />
              </div>
            </>
          )}

          {selectedCourse &&
            roundEntryMode === 'live' &&
            showLiveStartAction &&
            !loadingLiveGpsAvailability &&
            liveGpsAvailability?.available &&
            liveGpsAvailability.coverage === 'full' && (
              <>
                <label className="live-gps-toggle">
                  <span>Live GPS</span>
                  <span className="toggle-switch">
                    <input
                      type="checkbox"
                      aria-label="Live GPS"
                      checked={liveGpsEnabled}
                      onChange={(event) => {
                        markUserEdited();
                        const enabled = event.target.checked;
                        setLiveGpsEnabled(enabled);
                        if (!enabled) setLiveGpsTestLocationEnabled(false);
                      }}
                    />
                    <span className="toggle-slider" />
                  </span>
                </label>
                {isAdmin && (
                  <label className="live-gps-toggle">
                    <span>Test GPS Location</span>
                    <span className="toggle-switch">
                      <input
                        type="checkbox"
                        aria-label="Test GPS Location"
                        checked={liveGpsTestLocationEnabled}
                        disabled={!liveGpsEnabled}
                        onChange={(event) => {
                          setLiveGpsTestLocationEnabled(event.target.checked);
                        }}
                      />
                      <span className="toggle-slider" />
                    </span>
                  </label>
                )}
                <p className="combined-note">Hole maps and distances.</p>
              </>
            )}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => confirmLeaveAddRound(() => router.replace(getBackUrl()))}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            {showLiveStartAction ? (
              <button
                type="submit"
                disabled={startingLiveRound || !round.date || !round.course_id || !round.tee_id || liveStartHoleOptions.length === 0}
                className="btn btn-save"
              >
                <Play size={18} />
                {startingLiveRound ? 'Starting...' : 'Start Round'}
              </button>
            ) : roundEntryMode === 'after' && afterRoundEntryReady ? (
              <button type="submit" disabled={loading} className="btn btn-save">
                {loading ? 'Saving...' : 'Add Round'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AddRoundPage() {
  return (
    <Suspense fallback={null}>
      <AddRoundContent />
    </Suspense>
  );
}
