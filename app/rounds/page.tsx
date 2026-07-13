'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import RoundCard from '@/components/RoundCard';
import { CalendarDays, Clock, Play, Plus, Trash2 } from 'lucide-react';
import { RoundListSkeleton } from '@/components/skeleton/PageSkeletons';
import { clearLiveRoundRecoveryState, decideAddRoundEntry } from '@/lib/rounds/liveRoundResume';
import { teeSegmentLabel, type LiveRoundSession } from '@/components/rounds/live/types';
import { clearLiveRoundExitRedirect } from '@/lib/rounds/liveRoundNavigation';

interface Round {
  round_context?: 'real' | 'simulator' | 'practice' | null;
  id: number;
  date: string;
  score: number | null;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
  par: number | null;
  club_name: string;
  course_name: string;
  city: string;
  state: string;
  tee_id: number | null;
  tee_name: string;
  notes: string | null;
  hole_by_hole: boolean | null;
  number_of_holes: number;
  net_score: number | null;
}

const ROUNDS_REQUEST_DEDUPE_MS = 1200;
const roundsRequestCache = new Map<string, { startedAt: number; promise: Promise<{ status: number; data: any }> }>();

async function readApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data as T;
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

function fetchRoundsWithDedupe(url: string, userId: string): Promise<{ status: number; data: any }> {
  const requestKey = `${userId}:${url}`;
  const now = Date.now();
  const cached = roundsRequestCache.get(requestKey);
  if (cached && now - cached.startedAt < ROUNDS_REQUEST_DEDUPE_MS) {
    return cached.promise;
  }

  const promise = fetch(url).then(async (res) => ({
    status: res.status,
    data: await res.json().catch(() => ({})),
  }));

  roundsRequestCache.set(requestKey, { startedAt: now, promise });
  return promise;
}

export default function RoundsPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const router = useRouter();
  const { showMessage, clearMessage, showConfirm } = useMessage();

  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeLiveSessions, setActiveLiveSessions] = useState<LiveRoundSession[]>([]);
  const [loadingLiveSessions, setLoadingLiveSessions] = useState(false);
  const [liveSessionsError, setLiveSessionsError] = useState<string | null>(null);
  const [discardingLiveSessionId, setDiscardingLiveSessionId] = useState<string | null>(null);

  const observer = useRef<IntersectionObserver | null>(null);
  const didInitialFetchRef = useRef(false);
  const prevDebouncedSearchRef = useRef('');
  const prevUserIdRef = useRef<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      roundsRequestCache.clear();
      prevUserIdRef.current = userId;
    }
  }, [userId]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const fetchRounds = useCallback(async (pageToFetch: number, searchQuery: string, resetRounds = false) => {
    setLoading(true);
    clearMessage();

    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const url = `/api/rounds?limit=20&page=${pageToFetch}${searchParam}`;
      const cacheScope = userId ?? 'anon';
      const { status: responseStatus, data: responseData } = await fetchRoundsWithDedupe(url, cacheScope);

      if (responseStatus === 401 || responseStatus === 403) {
        router.replace('/login');
        return;
      }

      if (responseStatus < 200 || responseStatus >= 300) {
        throw new Error(responseData.message || responseData.error || 'Error fetching rounds');
      }

      const roundsData = responseData.rounds || [];

      const flattenedRounds: Round[] = roundsData.map((r: any) => ({
        id: Number(r.id),
        round_context: r.round_context ?? 'real',
        date: r.date,
        score: r.score != null ? Number(r.score) : null,
        fir_hit: r.fir_hit != null ? Number(r.fir_hit) : null,
        gir_hit: r.gir_hit != null ? Number(r.gir_hit) : null,
        putts: r.putts != null ? Number(r.putts) : null,
        penalties: r.penalties != null ? Number(r.penalties) : null,
        par: r.tee?.par_total ?? null,
        club_name: r.course?.club_name ?? '-',
        course_name: r.course?.course_name ?? '-',
        city: r.location?.city ?? '-',
        state: r.location?.state ?? '-',
        tee_id: r.tee?.id ?? null,
        tee_name: r.tee?.tee_name ?? '-',
        notes: r.notes ?? null,
        hole_by_hole: r.hole_by_hole ?? null,
        number_of_holes: r.tee?.number_of_holes ?? null,
        net_score: r.net_score ?? null
      }));

      setRounds((prev) => {
        if (resetRounds) {
          return flattenedRounds;
        }
        const map = new Map(prev.map((r) => [r.id, r]));
        flattenedRounds.forEach((r: Round) => map.set(r.id, r));
        return Array.from(map.values());
      });

      setHasMore(flattenedRounds.length === 20);
      setPage(pageToFetch);

    } catch (err: any) {
      console.error('Fetch rounds error:', err);
      showMessage(err.message || 'Error fetching rounds', 'error');
    } finally {
      setLoading(false);
    }
  }, [router, clearMessage, showMessage, userId]);

  const fetchActiveLiveSessions = useCallback(async () => {
    if (status !== 'authenticated') return;

    setLoadingLiveSessions(true);
    setLiveSessionsError(null);
    try {
      const data = await readApiResponse<{ sessions: LiveRoundSession[] }>(
        await fetch('/api/rounds/live/sessions', { cache: 'no-store' }),
      );
      setActiveLiveSessions(data.sessions || []);
    } catch (err: any) {
      const message = err?.message || 'Unable to load active live rounds';
      setLiveSessionsError(message);
      showMessage(message, 'error');
    } finally {
      setLoadingLiveSessions(false);
    }
  }, [showMessage, status]);

  // Initial load
  useEffect(() => {
    if (status === 'authenticated' && userId) {
      setRounds([]);
      setPage(1);
      setHasMore(true);
      fetchRounds(1, '', true);
      fetchActiveLiveSessions();
      didInitialFetchRef.current = true;
      prevDebouncedSearchRef.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId]);

  // Handle search changes
  useEffect(() => {
    if (!didInitialFetchRef.current) return;
    if (status === 'authenticated') {
      if (debouncedSearch === prevDebouncedSearchRef.current) return;
      setRounds([]);
      setPage(1);
      setHasMore(true);
      fetchRounds(1, debouncedSearch, true);
      prevDebouncedSearchRef.current = debouncedSearch;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const lastRoundRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchRounds(page + 1, debouncedSearch, false);
        }
      });
      if (node) observer.current.observe(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, hasMore, page, debouncedSearch]
  );

  const handleDelete = async (id: number) => {
    showConfirm({
      title: 'Delete round?',
      message: 'This round will be permanently deleted.',
      confirmText: 'Delete',
      variant: 'danger',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/rounds/${id}`, {
            method: 'DELETE',
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || 'Error deleting round');
          }

          showMessage('Round deleted successfully', 'success');
          // Refetch the current page
          setRounds([]);
          setPage(1);
          setHasMore(true);
          fetchRounds(1, debouncedSearch, true);
        } catch (err: any) {
          console.error('Delete round error:', err);
          showMessage(err.message || 'Error deleting round', 'error');
        }
      }
    });
  };

  const handleAddRoundClick = () => {
    if (!userId) return;
    const startNewTarget = '/rounds/add?from=rounds';
    const decision = decideAddRoundEntry({
      userId,
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
          clearLiveRoundRecoveryState(userId);
          router.push(decision.startNewTarget);
        },
      });
      return;
    }

    router.push(decision.startNewTarget);
  };

  const handleDiscardLiveSession = (liveSession: LiveRoundSession) => {
    const courseLabel = sessionCourseLabel(liveSession);
    showConfirm({
      title: 'Delete live round?',
      message: `This removes ${courseLabel} from your resume list. This cannot be undone.`,
      cancelText: 'Keep Round',
      confirmText: 'Delete',
      variant: 'danger',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setDiscardingLiveSessionId(liveSession.id);
        setLiveSessionsError(null);
        try {
          await readApiResponse<{ session: LiveRoundSession }>(
            await fetch(`/api/rounds/live/sessions/${liveSession.id}/discard`, {
              method: 'POST',
            }),
          );
          setActiveLiveSessions((current) => current.filter((sessionItem) => sessionItem.id !== liveSession.id));
        } catch (err: any) {
          const message = err?.message || 'Unable to delete live round';
          setLiveSessionsError(message);
          showMessage(message, 'error');
        } finally {
          setDiscardingLiveSessionId(null);
        }
      },
    });
  };

  const renderActiveLiveSessions = () => {
    if (activeLiveSessions.length === 0) return null;

    return (
      <section className="live-round-add-panel">
        <div className="card last-five-rounds-card">
          <h3>In Progress</h3>
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
                    onClick={() => {
                      clearLiveRoundExitRedirect(liveSession.id);
                      router.push(`/rounds/live/${liveSession.id}`);
                    }}
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
                    aria-label={isDiscarding ? 'Deleting live round' : 'Delete live round'}
                    title={isDiscarding ? 'Deleting live round' : 'Delete live round'}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  if (status === 'unauthenticated') {
    return null;
  }

  const showInitialListSkeleton = status === 'loading' || (loading && rounds.length === 0);

  return (
    <div className="page-stack">
      <button
        onClick={handleAddRoundClick}
        className="btn btn-add"
        disabled={status !== 'authenticated'}
      >
        <Plus/> Add Round
      </button>

      {liveSessionsError && <div className="live-round-alert is-error">{liveSessionsError}</div>}
      {loadingLiveSessions && activeLiveSessions.length === 0 ? null : renderActiveLiveSessions()}

      <input
        type="text"
        placeholder="Search Rounds"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={status !== 'authenticated'}
        onFocus={(e) => {
          const len = e.target.value.length;
          e.target.setSelectionRange(len, len);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        enterKeyHint="search"
        className="form-input"
        max={250}
      />

      {showInitialListSkeleton ? (
        <RoundListSkeleton count={12} useGridList />
      ) : rounds.length === 0 && !loading ? (
        <p className='secondary-text text-center'>No rounds logged.</p>
      ) : (
        <div className="grid grid-1">
          {rounds.map((round, index) => {
            const isLast = index === rounds.length - 1;
            return (
              <div key={round.id} ref={isLast ? lastRoundRef : null}>
                <RoundCard
                  round={round}
                  showHoles={true}
                />
              </div>
            );
          })}
        </div>
      )}

      {loading && rounds.length > 0 && <RoundListSkeleton count={2} useGridList />}
    </div>
  );
}
