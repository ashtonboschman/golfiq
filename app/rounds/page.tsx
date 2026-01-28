'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import RoundCard from '@/components/RoundCard';
import { Plus } from 'lucide-react';

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
}

export default function RoundsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showMessage, clearMessage } = useMessage();

  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const observer = useRef<IntersectionObserver | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

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
      const res = await fetch(`/api/rounds?limit=20&page=${pageToFetch}${searchParam}`);

      if (res.status === 401 || res.status === 403) {
        router.replace('/login');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Error fetching rounds');
      }

      const result = await res.json();
      const roundsData = result.rounds || [];

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
  }, [router, clearMessage, showMessage]);

  // Initial load
  useEffect(() => {
    if (status === 'authenticated') {
      setRounds([]);
      setPage(1);
      setHasMore(true);
      fetchRounds(1, '', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Handle search changes
  useEffect(() => {
    if (status === 'authenticated') {
      setRounds([]);
      setPage(1);
      setHasMore(true);
      fetchRounds(1, debouncedSearch, true);
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
    if (!window.confirm('Are you sure you want to delete this round?')) return;

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
  };

  if (status === 'loading') return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      <button onClick={() => router.push('/rounds/add?from=rounds')} className="btn btn-add">
        <Plus/> Add Round
      </button>

      <input
        type="text"
        placeholder="Search Rounds"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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

      {rounds.length === 0 && !loading ? (
        <p className='secondary-text'>No rounds found.</p>
      ) : (
        <div className="grid grid-1">
          {rounds.map((round, index) => {
            const isLast = index === rounds.length - 1;
            return (
              <div key={round.id} ref={isLast ? lastRoundRef : null}>
                <RoundCard
                  round={round}
                  onEdit={(id) => router.push(`/rounds/edit/${id}?from=rounds`)}
                  onDelete={handleDelete}
                  showAdvanced={true}
                />
              </div>
            );
          })}
        </div>
      )}

      {loading && <p className='loading-text'>Loading rounds...</p>}
    </div>
  );
}
