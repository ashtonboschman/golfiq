'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import RoundCard from '@/components/RoundCard';
import { Plus } from 'lucide-react';
import { RoundListSkeleton } from '@/components/skeleton/PageSkeletons';

interface Round {
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

      if (!roundsData.length && resetRounds) {
        showMessage('No rounds found. Add your first round!', 'success');
      }
    } catch (err: any) {
      console.error('Fetch rounds error:', err);
      showMessage(err.message || 'Error fetching rounds', 'error');
    } finally {
      setLoading(false);
    }
  }, [router, clearMessage, showMessage, userId]);

  // Initial load
  useEffect(() => {
    if (status === 'authenticated' && userId) {
      setRounds([]);
      setPage(1);
      setHasMore(true);
      fetchRounds(1, '', true);
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
      message: 'Are you sure you want to delete this round?',
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

  if (status === 'unauthenticated') {
    return null;
  }

  const showInitialListSkeleton = status === 'loading' || (loading && rounds.length === 0);

  return (
    <div className="page-stack">
      <button
        onClick={() => router.push('/rounds/add?from=rounds')}
        className="btn btn-add"
        disabled={status !== 'authenticated'}
      >
        <Plus/> Add Round
      </button>

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
        <p className='secondary-text'>No rounds found.</p>
      ) : (
        <div className="grid grid-1">
          {rounds.map((round, index) => {
            const isLast = index === rounds.length - 1;
            return (
              <div key={round.id} ref={isLast ? lastRoundRef : null}>
                <RoundCard
                  round={round}
                  showHoles={true}
                  showAdvanced={true}
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
