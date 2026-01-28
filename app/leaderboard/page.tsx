'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LeaderboardCard from '@/components/LeaderboardCard';
import LeaderboardHeader from '@/components/LeaderboardHeader';
import { Crown } from 'lucide-react';

interface LeaderboardUser {
  user_id: number;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  handicap: number | null;
  average_score: number | null;
  best_score: number | null;
  total_rounds: number;
  rank: number;
}

export default function LeaderboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('handicap');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [scope, setScope] = useState('global');
  const [isPremium, setIsPremium] = useState(false);
  const [showingLimited, setShowingLimited] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const fetchLeaderboard = useCallback(async (pageToFetch: number, resetUsers = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?scope=${scope}&limit=25&page=${pageToFetch}`);
      const data = await res.json();
      if (data.type === 'success') {
        const newUsers = data.users || [];

        setUsers((prev) => {
          if (resetUsers) {
            return newUsers;
          }
          const map = new Map(prev.map((u) => [u.user_id, u]));
          newUsers.forEach((u: LeaderboardUser) => map.set(u.user_id, u));
          return Array.from(map.values());
        });

        setIsPremium(data.isPremium || false);
        setShowingLimited(data.showingLimited || false);
        setTotalUsers(data.totalUsers || 0);
        setHasMore(data.hasMore || false);
        setPage(pageToFetch);
      }
    } catch (err) {
      console.error('Fetch leaderboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    if (status === 'authenticated') {
      setUsers([]);
      setPage(1);
      setHasMore(true);
      fetchLeaderboard(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, scope]);

  const lastUserRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchLeaderboard(page + 1, false);
        }
      });
      if (node) observer.current.observe(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, hasMore, page]
  );

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    const compareNumbers = (v1: number | null, v2: number | null, asc = true) => {
      const val1 = v1 ?? 999;
      const val2 = v2 ?? 999;
      return asc ? val1 - val2 : val2 - val1;
    };

    let result = 0;
    if (sortBy === 'handicap')
      result = compareNumbers(a.handicap, b.handicap, sortOrder === 'asc');
    else if (sortBy === 'average_score')
      result = compareNumbers(a.average_score, b.average_score, sortOrder === 'asc');
    else if (sortBy === 'best_score')
      result = compareNumbers(a.best_score, b.best_score, sortOrder === 'asc');
    else if (sortBy === 'total_rounds')
      result = compareNumbers(a.total_rounds, b.total_rounds, sortOrder === 'asc');

    if (result !== 0) return result;

    // Tiebreakers
    result = compareNumbers(a.handicap, b.handicap, true);
    if (result !== 0) return result;

    result = compareNumbers(a.average_score, b.average_score, true);
    if (result !== 0) return result;

    result = compareNumbers(a.total_rounds, b.total_rounds, false);
    if (result !== 0) return result;

    return compareNumbers(a.best_score, b.best_score, true);
  });

  const usersWithRank = sortedUsers.map((user, index) => ({
    ...user,
    _rank: user.rank,
  }));

  if (status === 'loading') return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      <div className="stats-tabs">
        <button
          className={`stats-tab ${scope === 'global' ? 'active' : ''}`}
          onClick={() => setScope('global')}
        >
          Global
        </button>
        <button
          className={`stats-tab ${scope === 'friends' ? 'active' : ''}`}
          onClick={() => setScope('friends')}
        >
          Friends
        </button>
      </div>

      {/* Premium upgrade CTA for limited leaderboard */}
      {scope === 'global' && true && (
        <div className="info-banner warning">
          <div className="info-banner-content">
            <div className="info-banner-icon"><Crown size='45'/></div>
            <div className="info-banner-text">
              <h4>Want the full picture?</h4>
              <p>
                Currently showing top 100 players out of {totalUsers}. Upgrade to Premium to see the entire global leaderboard and your true ranking.
              </p>
            </div>
            <button
              className="btn btn-upgrade"
              onClick={() => router.push('/pricing')}
            >
              See Full Leaderboard
            </button>
          </div>
        </div>
      )}

      <LeaderboardHeader sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />

      {usersWithRank.map((user, index) => {
        const isLast = index === usersWithRank.length - 1;
        return (
          <div key={user.user_id} ref={isLast ? lastUserRef : null}>
            <LeaderboardCard
              user={user}
              rank={user._rank}
              isCurrentUser={user.user_id === Number(session?.user?.id)}
            />
          </div>
        );
      })}

      {loading && <p className='loading-text'>Loading more users...</p>}
    </div>
  );
}
