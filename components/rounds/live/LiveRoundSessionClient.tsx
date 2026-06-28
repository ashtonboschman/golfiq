'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, ClipboardList, Flag, LoaderCircle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import LiveHoleScoreEntry from '@/components/rounds/live/LiveHoleScoreEntry';
import {
  sessionTrackingPrefs,
  sortHoleDrafts,
  teeSegmentLabel,
  type LiveRoundHoleDraft,
  type LiveRoundSession,
  type RoundContext,
} from '@/components/rounds/live/types';
import {
  LIVE_ROUND_NAVIGATION_EVENT,
  type LiveRoundNavigationRequest,
} from '@/lib/rounds/liveRoundNavigation';
import { createLatestAutosaveQueue } from '@/lib/rounds/latestAutosaveQueue';

type LiveRoundSessionClientProps = {
  sessionId: string;
};

type ApiResponse<T> = T & {
  type?: 'success' | 'error';
  message?: string;
};

type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type LiveRoundViewMode = 'score' | 'review';
type TaggedRoundContext = Exclude<RoundContext, 'real'>;

const roundTagOptions: Array<{ value: TaggedRoundContext; label: string }> = [
  { value: 'simulator', label: 'Simulator Round' },
  { value: 'practice', label: 'Practice Round' },
];

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

function courseLabel(session: LiveRoundSession) {
  if (!session.course) return 'Live Round';
  return session.course.club_name === session.course.course_name
    ? session.course.course_name
    : `${session.course.club_name} - ${session.course.course_name}`;
}

function formatDate(date: string) {
  return date ? date.slice(0, 10) : '';
}

function draftSavePayload(draft: LiveRoundHoleDraft) {
  return {
    draft_id: draft.id,
    hole_id: draft.hole_id,
    pass: draft.pass,
    score: draft.score,
    fir_hit: draft.fir_hit,
    fir_direction: draft.fir_direction,
    gir_hit: draft.gir_hit,
    gir_direction: draft.gir_direction,
    putts: draft.putts,
    penalties: draft.penalties,
    chips: draft.chips,
    greenside_bunker_shots: draft.greenside_bunker_shots,
  };
}

function formatToPar(value: number) {
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : String(value);
}

function roundTagLabel(roundContext: RoundContext) {
  return roundContext === 'simulator' ? 'Simulator' : 'Practice';
}

function teePillClass(teeName?: string | null) {
  const normalized = teeName?.trim().toLowerCase().replace(/\s+/g, '-') || 'default';
  return `tee-${normalized}`;
}

function formatRatingSlope(session: LiveRoundSession) {
  const rating = session.tee?.course_rating;
  const slope = session.tee?.slope_rating;
  if (rating == null && slope == null) return null;
  if (rating == null) return String(slope);
  if (slope == null) return rating.toFixed(1);
  return `${rating.toFixed(1)} / ${slope}`;
}

function orderDraftsForPlay(drafts: LiveRoundHoleDraft[], startHoleNumber: number) {
  if (drafts.length <= 1) return drafts;
  const startIndex = drafts.findIndex((draft) => draft.display_hole_number === startHoleNumber);
  if (startIndex <= 0) return drafts;
  return [...drafts.slice(startIndex), ...drafts.slice(0, startIndex)];
}

function scrollLiveRoundToTop({ defer = false }: { defer?: boolean } = {}) {
  if (typeof window === 'undefined') return;

  const scroll = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.querySelector('.page-container')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  if (defer) {
    requestAnimationFrame(scroll);
    return;
  }

  scroll();
}

export default function LiveRoundSessionClient({ sessionId }: LiveRoundSessionClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const { showConfirm } = useMessage();
  const [session, setSession] = useState<LiveRoundSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [autosaveMessage, setAutosaveMessage] = useState<string>('Loaded');
  const [finalizing, setFinalizing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [viewMode, setViewMode] = useState<LiveRoundViewMode>('score');
  const [returnToReviewAvailable, setReturnToReviewAvailable] = useState(false);
  const [reviewReturnDraftId, setReviewReturnDraftId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [showRoundTagPicker, setShowRoundTagPicker] = useState(false);
  const [hasPendingNotes, setHasPendingNotes] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPushedBackGuardRef = useRef(false);
  const allowBrowserBackRef = useRef(false);

  const draftSaveQueue = useMemo(() => createLatestAutosaveQueue({
    save: async (draft: LiveRoundHoleDraft) => {
      const response = await fetch(`/api/rounds/live/sessions/${sessionId}/holes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftSavePayload(draft)),
      });
      return readApiResponse<{ draft: LiveRoundHoleDraft; session: LiveRoundSession }>(response);
    },
    onSaving: () => {
      setAutosaveStatus('saving');
      setAutosaveMessage('Saving...');
    },
    onSaved: (_draft, data, hasNewerPendingValue) => {
      if (hasNewerPendingValue) return;
      setSession((current) => current ? {
        ...current,
        hole_drafts: data.session.hole_drafts,
        last_saved_at: data.session.last_saved_at,
        updated_at: data.session.updated_at,
      } : data.session);
      setAutosaveStatus('saved');
      setAutosaveMessage('Saved');
    },
    onError: (err) => {
      setAutosaveStatus('error');
      setAutosaveMessage(err instanceof Error ? err.message : 'Autosave failed');
    },
  }), [sessionId]);

  const notesSaveQueue = useMemo(() => createLatestAutosaveQueue({
    save: async (notes: string) => {
      const response = await fetch(`/api/rounds/live/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      return readApiResponse<{ session: LiveRoundSession }>(response);
    },
    onSaving: () => {
      setAutosaveStatus('saving');
      setAutosaveMessage('Saving...');
    },
    onSaved: (_notes, data, hasNewerPendingValue) => {
      if (hasNewerPendingValue) return;
      setSession((current) => current ? {
        ...current,
        notes: data.session.notes,
        last_saved_at: data.session.last_saved_at,
        updated_at: data.session.updated_at,
      } : data.session);
      setHasPendingNotes(false);
      setAutosaveStatus('saved');
      setAutosaveMessage('Saved');
    },
    onError: (err) => {
      setHasPendingNotes(true);
      setAutosaveStatus('error');
      setAutosaveMessage(err instanceof Error ? err.message : 'Notes autosave failed');
    },
  }), [sessionId]);

  const contextSaveQueue = useMemo(() => createLatestAutosaveQueue({
    save: async (roundContext: RoundContext) => {
      const response = await fetch(`/api/rounds/live/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_context: roundContext }),
      });
      return readApiResponse<{ session: LiveRoundSession }>(response);
    },
    onSaving: () => {
      setAutosaveStatus('saving');
      setAutosaveMessage('Saving...');
    },
    onSaved: (_roundContext, data, hasNewerPendingValue) => {
      if (hasNewerPendingValue) return;
      setSession((current) => current ? {
        ...current,
        round_context: data.session.round_context,
        last_saved_at: data.session.last_saved_at,
        updated_at: data.session.updated_at,
      } : data.session);
      setAutosaveStatus('saved');
      setAutosaveMessage('Saved');
    },
    onError: (err) => {
      setAutosaveStatus('error');
      setAutosaveMessage(err instanceof Error ? err.message : 'Round tag save failed');
    },
  }), [sessionId]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  const loadSession = useCallback(async () => {
    if (status !== 'authenticated') return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rounds/live/sessions/${sessionId}`, { cache: 'no-store' });
      const data = await readApiResponse<{ session: LiveRoundSession }>(response);
      if (data.session.status === 'COMPLETED' && data.session.final_round_id) {
        router.replace(`/rounds/${data.session.final_round_id}/stats?from=rounds`);
        return;
      }
      setSession(data.session);
      setNotesDraft(data.session.notes ?? '');
      setAutosaveStatus('saved');
      setAutosaveMessage('Saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live round');
    } finally {
      setLoading(false);
    }
  }, [router, sessionId, status]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
    }
  }, []);

  const sortedDrafts = useMemo(
    () => sortHoleDrafts(session?.hole_drafts || []),
    [session?.hole_drafts],
  );

  const playOrderDrafts = useMemo(
    () => orderDraftsForPlay(sortedDrafts, session?.start_hole_number ?? 1),
    [session?.start_hole_number, sortedDrafts],
  );

  const activeDraft = useMemo(() => {
    if (!session) return null;
    return sortedDrafts.find((draft) => (
      draft.display_hole_number === session.active_hole_number &&
      draft.pass === session.active_hole_pass
    )) || sortedDrafts[0] || null;
  }, [session, sortedDrafts]);

  const activeIndex = useMemo(() => {
    if (!activeDraft) return -1;
    return playOrderDrafts.findIndex((draft) => draft.id === activeDraft.id);
  }, [activeDraft, playOrderDrafts]);

  const missingScoreDrafts = useMemo(
    () => sortedDrafts.filter((draft) => draft.score === null),
    [sortedDrafts],
  );

  const totalScore = useMemo(
    () => sortedDrafts.reduce((sum, draft) => sum + (draft.score ?? 0), 0),
    [sortedDrafts],
  );

  const totalPar = useMemo(
    () => sortedDrafts.reduce((sum, draft) => sum + (draft.hole?.par ?? 0), 0),
    [sortedDrafts],
  );

  const scheduleSave = useCallback((draft: LiveRoundHoleDraft) => {
    draftSaveQueue.enqueue(draft);
    setAutosaveStatus('pending');
    setAutosaveMessage('Unsaved changes');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void draftSaveQueue.flush();
    }, 700);
  }, [draftSaveQueue]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    return draftSaveQueue.flush();
  }, [draftSaveQueue]);

  const scheduleNotesSave = useCallback((notes: string) => {
    notesSaveQueue.enqueue(notes);
    setHasPendingNotes(true);
    setAutosaveStatus('pending');
    setAutosaveMessage('Unsaved changes');

    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
    }

    notesTimerRef.current = setTimeout(() => {
      notesTimerRef.current = null;
      void notesSaveQueue.flush();
    }, 700);
  }, [notesSaveQueue]);

  const flushNotes = useCallback(async () => {
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }

    return notesSaveQueue.flush();
  }, [notesSaveQueue]);

  const flushContext = useCallback(() => contextSaveQueue.flush(), [contextSaveQueue]);

  const flushAll = useCallback(async () => {
    const draftSaved = await flushSave();
    if (!draftSaved) return false;
    const notesSaved = await flushNotes();
    if (!notesSaved) return false;
    return flushContext();
  }, [flushContext, flushNotes, flushSave]);

  const retrySave = useCallback(async () => {
    setError(null);
    await flushAll();
  }, [flushAll]);

  const handleDraftChange = (nextDraft: LiveRoundHoleDraft) => {
    setSession((current) => {
      if (!current) return current;
      return {
        ...current,
        hole_drafts: current.hole_drafts.map((draft) => (
          draft.id === nextDraft.id ? nextDraft : draft
        )),
      };
    });
    scheduleSave(nextDraft);
  };

  const handleNotesChange = (notes: string) => {
    setNotesDraft(notes);
    scheduleNotesSave(notes);
  };

  const handleRoundContextChange = (roundContext: RoundContext) => {
    if (!session) return;

    setShowRoundTagPicker(false);
    if (roundContext === session.round_context) return;

    setSession((current) => (
      current ? { ...current, round_context: roundContext } : current
    ));
    contextSaveQueue.enqueue(roundContext);
    setAutosaveStatus('pending');
    setAutosaveMessage('Unsaved changes');
    void contextSaveQueue.flush();
  };

  const shouldWarnBeforeUnload = autosaveStatus === 'pending' ||
    autosaveStatus === 'saving' ||
    autosaveStatus === 'error' ||
    hasPendingNotes;

  const confirmLeaveLiveRound = useCallback((navigate: () => void) => {
    if (!session || session.status !== 'ACTIVE') {
      navigate();
      return;
    }

    showConfirm({
      title: 'Leave live round?',
      message: 'Your round is saved and can be resumed.',
      cancelText: 'Stay',
      confirmText: 'Leave',
      variant: 'neutral',
      confirmVariant: 'neutral',
      onConfirm: async () => {
        const saved = await flushAll();
        if (!saved) return;
        navigate();
      },
    });
  }, [flushAll, session, showConfirm]);

  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;
    if (!shouldWarnBeforeUnload) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session, shouldWarnBeforeUnload]);

  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;

    if (!hasPushedBackGuardRef.current) {
      window.history.pushState({ golfiqLiveRoundGuard: true }, '', window.location.href);
      hasPushedBackGuardRef.current = true;
      allowBrowserBackRef.current = false;
    }

    const restoreGuard = () => {
      window.history.pushState({ golfiqLiveRoundGuard: true }, '', window.location.href);
    };

    const handlePopState = () => {
      if (allowBrowserBackRef.current) return;

      showConfirm({
        title: 'Leave live round?',
        message: 'Your round is saved and can be resumed.',
        cancelText: 'Stay',
        confirmText: 'Leave',
        variant: 'neutral',
        confirmVariant: 'neutral',
        onCancel: restoreGuard,
        onConfirm: async () => {
          const saved = await flushAll();
          if (!saved) {
            restoreGuard();
            return;
          }
          allowBrowserBackRef.current = true;
          window.history.back();
        },
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [flushAll, session, showConfirm]);

  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;

    const handleLiveRoundNavigationRequest = (event: Event) => {
      const navigationEvent = event as CustomEvent<LiveRoundNavigationRequest>;
      const detail = navigationEvent.detail;

      navigationEvent.preventDefault();
      confirmLeaveLiveRound(() => {
        if (detail.back) {
          allowBrowserBackRef.current = true;
          window.history.go(-2);
          return;
        }

        if (!detail.path) return;

        if (detail.replace) {
          router.replace(detail.path);
        } else {
          router.push(detail.path);
        }
      });
    };

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
      if (nextUrl.pathname.startsWith('/rounds/live/')) return;

      event.preventDefault();
      confirmLeaveLiveRound(() => {
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      });
    };

    window.addEventListener(LIVE_ROUND_NAVIGATION_EVENT, handleLiveRoundNavigationRequest);
    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      window.removeEventListener(LIVE_ROUND_NAVIGATION_EVENT, handleLiveRoundNavigationRequest);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [confirmLeaveLiveRound, router, session]);

  const moveToDraft = async (
    targetDraft: LiveRoundHoleDraft,
    options: { fromReview?: boolean } = {},
  ) => {
    if (!session) return;

    const saved = await flushAll();
    if (!saved) return;

    setError(null);
    setAutosaveStatus('saving');
    setAutosaveMessage('Saving...');
    try {
      const response = await fetch(`/api/rounds/live/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_hole_number: targetDraft.display_hole_number,
          active_hole_pass: targetDraft.pass,
          active_step: 'SCORE',
        }),
      });
      const data = await readApiResponse<{ session: LiveRoundSession }>(response);
      scrollLiveRoundToTop();
      setSession((current) => current ? {
        ...current,
        active_hole_number: data.session.active_hole_number,
        active_hole_pass: data.session.active_hole_pass,
        active_step: data.session.active_step,
        hole_drafts: data.session.hole_drafts,
        last_saved_at: data.session.last_saved_at,
        updated_at: data.session.updated_at,
      } : data.session);
      setReturnToReviewAvailable(Boolean(options.fromReview));
      setAutosaveStatus('saved');
      setAutosaveMessage('Saved');
      setViewMode('score');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to move holes');
      setAutosaveStatus('error');
      setAutosaveMessage(err instanceof Error ? err.message : 'Unable to move holes');
    }
  };

  const handlePrevious = () => {
    if (activeIndex <= 0) return;
    setReturnToReviewAvailable(false);
    moveToDraft(playOrderDrafts[activeIndex - 1]);
  };

  const handleNext = () => {
    if (activeIndex < 0 || activeIndex >= playOrderDrafts.length - 1) return;
    setReturnToReviewAvailable(false);
    moveToDraft(playOrderDrafts[activeIndex + 1]);
  };

  const handleReview = async () => {
    const saved = await flushAll();
    if (!saved) return;
    setError(null);
    setReviewReturnDraftId(activeDraft?.id ?? null);
    setReturnToReviewAvailable(false);
    scrollLiveRoundToTop();
    setViewMode('review');
  };

  const handleBackToScore = () => {
    setReturnToReviewAvailable(false);
    const targetDraft = sortedDrafts.find((draft) => draft.id === reviewReturnDraftId);
    setReviewReturnDraftId(null);
    if (targetDraft) {
      moveToDraft(targetDraft);
      return;
    }
    scrollLiveRoundToTop();
    setViewMode('score');
  };

  const handleFinalize = async () => {
    if (!session) return;

    if (missingScoreDrafts.length > 0) {
      setError('Add a score for every hole before finishing the round.');
      setViewMode('review');
      return;
    }

    setFinalizing(true);
    setError(null);
    const saved = await flushAll();
    if (!saved) {
      setFinalizing(false);
      return;
    }

    try {
      const response = await fetch(`/api/rounds/live/sessions/${session.id}/finalize`, {
        method: 'POST',
      });
      const data = await readApiResponse<{ roundId: string; session: LiveRoundSession }>(response);
      router.replace(`/rounds/${data.roundId}/stats?from=rounds`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finish live round');
    } finally {
      setFinalizing(false);
    }
  };

  const handleDiscard = async () => {
    if (!session) return;

    showConfirm({
      title: 'Discard live round?',
      message: 'This removes it from your resume list. This cannot be undone.',
      cancelText: 'Keep Round',
      confirmText: 'Discard',
      variant: 'danger',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setDiscarding(true);
        setError(null);
        await flushAll();

        try {
          const response = await fetch(`/api/rounds/live/sessions/${session.id}/discard`, {
            method: 'POST',
          });
          const data = await readApiResponse<{ session: LiveRoundSession }>(response);
          setSession(data.session);
          setAutosaveStatus('idle');
          setAutosaveMessage('Discarded');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to discard live round');
        } finally {
          setDiscarding(false);
        }
      },
    });
  };

  if (status === 'loading' || loading) {
    return (
      <div className="page-stack">
        <section className="card">
          <div className="live-round-muted">Loading live round...</div>
        </section>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="page-stack">
        <section className="card">
          <div className="live-round-alert is-error">{error}</div>
          <button type="button" className="btn btn-accent" onClick={() => router.push('/rounds/add?mode=live')}>
            Back To Setup
          </button>
        </section>
      </div>
    );
  }

  if (!session) return null;

  if (session.status === 'DISCARDED') {
    return (
      <div className="page-stack">
        <section className="card">
          <div className="live-round-alert">
            This live round has been discarded.
          </div>
          <button type="button" className="btn btn-accent" onClick={() => router.push('/rounds/add?mode=live')}>
            Start Another Round
          </button>
        </section>
      </div>
    );
  }

  if (!activeDraft) {
    return (
      <div className="page-stack">
        <section className="card">
          <div className="live-round-alert is-error">This session has no hole drafts.</div>
          <button type="button" className="btn btn-accent" onClick={() => router.push('/rounds/add?mode=live')}>
            Back To Setup
          </button>
        </section>
      </div>
    );
  }

  const trackingPrefs = sessionTrackingPrefs(session);
  const roundTypeLabel = teeSegmentLabel(session.tee_segment, session.tee?.number_of_holes);
  const teeName = session.tee?.tee_name || 'Selected Tee';
  const ratingSlopeLabel = formatRatingSlope(session);
  const isFirst = activeIndex <= 0;
  const isLast = activeIndex === playOrderDrafts.length - 1;
  const canFinish = missingScoreDrafts.length === 0;
  const lastHoleActionLabel = missingScoreDrafts.length > 0 ? 'Review Missing Scores' : 'Review Round';
  const showSaveSpinner = autosaveStatus === 'pending' || autosaveStatus === 'saving';
  const physicalHoleNote = session.tee_segment === 'double9' && activeDraft.pass === 2
    ? `Physical Hole ${activeDraft.hole_number}, Pass 2`
    : null;

  return (
    <div className="page-stack live-round-page">
      <section className="card live-round-session-card">
        <div className="live-round-topbar">
          <div>
            <h1>{courseLabel(session)}</h1>
            <div className="live-round-header-meta">
              <span className="live-round-header-date">
                <CalendarDays size={14} aria-hidden="true" />
                {formatDate(session.date)}
              </span>
              <span className="round-holes-tag">{roundTypeLabel}</span>
              <span className={`tee-tag ${teePillClass(session.tee?.tee_name)}`}>{teeName}</span>
              {ratingSlopeLabel && (
                <span className="round-holes-tag">{ratingSlopeLabel}</span>
              )}
            </div>
          </div>
          <span
            className={`live-round-save-indicator ${showSaveSpinner ? 'is-saving' : 'is-idle'}`}
            role={showSaveSpinner ? 'status' : undefined}
            aria-label={showSaveSpinner ? 'Saving' : undefined}
            aria-hidden={showSaveSpinner ? undefined : true}
            title={showSaveSpinner ? 'Saving' : undefined}
          >
            {showSaveSpinner && <LoaderCircle size={18} />}
          </span>
        </div>

        {error && <div className="live-round-alert is-error">{error}</div>}
        {autosaveStatus === 'error' && (
          <div className="live-round-alert is-error">
            <AlertTriangle size={18} />
            <span>Save failed - {autosaveMessage}</span>
            <button
              type="button"
              className="btn btn-secondary live-round-inline-action"
              onClick={retrySave}
            >
              Retry
            </button>
          </div>
        )}

        {viewMode === 'review' ? (
          <div className="live-round-review-panel">
            <div className="live-round-review-heading">
              <h2>Round Summary</h2>
            </div>

            <div className="live-round-review-grid">
              <div>
                <span>Total</span>
                <strong>{canFinish ? totalScore : '--'}</strong>
              </div>
              <div>
                <span>To Par</span>
                <strong>{canFinish ? formatToPar(totalScore - totalPar) : '--'}</strong>
              </div>
            </div>

            <div className="live-round-review-scorecard">
              {sortedDrafts.map((draft) => {
                const isMissing = draft.score === null;
                return (
                  <button
                    key={draft.id}
                    type="button"
                    className={`live-round-review-hole-row ${isMissing ? 'is-missing' : ''}`}
                    onClick={() => moveToDraft(draft, { fromReview: true })}
                  >
                    <span>Hole {draft.display_hole_number}</span>
                    <span>Par {draft.hole?.par ?? '-'}</span>
                    <span>{draft.hole?.yardage ? `${draft.hole.yardage} yds` : 'Yards -'}</span>
                    <strong>{isMissing ? 'Missing' : draft.score}</strong>
                  </button>
                );
              })}
            </div>

            <div className="form-row">
              <div className="round-tag-control">
                <div className="round-tag-inline">
                  {session.round_context === 'real' ? (
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
                      {roundTagLabel(session.round_context)}
                    </button>
                  )}
                  {session.round_context !== 'real' && (
                    <button
                      type="button"
                      className="round-tag-clear"
                      onClick={() => handleRoundContextChange('real')}
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
                        className={`round-tag-pill ${session.round_context === option.value ? 'is-selected' : ''}`}
                        onClick={() => handleRoundContextChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {session.round_context !== 'real' && (
                <p className="combined-note">Tagged rounds are excluded from handicap, leaderboard, and overall insights.</p>
              )}
            </div>

            <div className="form-row">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input live-round-notes"
                value={notesDraft}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="Anything to remember from this round?"
                rows={4}
                maxLength={500}
              />
            </div>

            <div className="live-round-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBackToScore}
                disabled={finalizing}
              >
                <ArrowLeft size={18} />
                Back To Score
              </button>
              <button
                type="button"
                className="btn btn-save"
                onClick={handleFinalize}
                disabled={!canFinish || finalizing || autosaveStatus === 'saving'}
              >
                <Flag size={18} />
                {finalizing ? 'Finishing...' : 'Finish Round'}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-cancel"
              onClick={handleDiscard}
              disabled={discarding || finalizing}
            >
              <Trash2 size={18} />
              {discarding ? 'Discarding...' : 'Discard Round'}
            </button>
          </div>
        ) : (
          <>
            <div className="live-round-hole-panel">
              <div
                className={`live-round-hole-summary${activeDraft.hole?.handicap == null ? ' without-handicap' : ''}`}
              >
                <div>
                  <span>Hole</span>
                  <strong>{activeDraft.display_hole_number}</strong>
                  {physicalHoleNote && <small>{physicalHoleNote}</small>}
                </div>
                <div>
                  <span>Par</span>
                  <strong>{activeDraft.hole?.par ?? '-'}</strong>
                </div>
                <div>
                  <span>Yards</span>
                  <strong>{activeDraft.hole?.yardage ?? '-'}</strong>
                </div>
                {activeDraft.hole?.handicap != null && (
                  <div>
                    <span>HCP</span>
                    <strong>{activeDraft.hole.handicap}</strong>
                  </div>
                )}
              </div>

              <LiveHoleScoreEntry
                draft={activeDraft}
                trackingPrefs={trackingPrefs}
                onChange={handleDraftChange}
              />
            </div>

            <div className="live-round-actions live-round-hole-nav-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePrevious}
                disabled={isFirst}
              >
                <ArrowLeft size={18} />
                Previous Hole
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={isLast ? handleReview : handleNext}
              >
                {isLast ? lastHoleActionLabel : 'Next Hole'}
                <ArrowRight size={18} />
              </button>
            </div>

            {(returnToReviewAvailable || (canFinish && !isLast)) && (
              <button
                type="button"
                className="btn btn-secondary live-round-review-shortcut"
                onClick={handleReview}
                disabled={finalizing}
              >
                <ClipboardList size={18} />
                {returnToReviewAvailable ? 'Back To Review' : 'Review Round'}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

