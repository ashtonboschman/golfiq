'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
  const [sortBy, setSortBy] = useState<'handicap' | 'average_score' | 'best_score'>('handicap');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [showingLimited, setShowingLimited] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const observer = useRef<IntersectionObserver | null>(null);

  // redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // fetch leaderboard whenever scope or sort changes
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchLeaderboard = async (pageToFetch: number, reset = false) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/leaderboard?scope=${scope}&limit=25&page=${pageToFetch}&sortBy=${sortBy}&sortOrder=${sortOrder}`
        );
        const data = await res.json();
        if (data.type === 'success') {
          const newUsers: LeaderboardUser[] = data.users || [];

          setUsers(prev => {
            if (reset) return newUsers;
            const map = new Map(prev.map(u => [u.user_id, u]));
            newUsers.forEach(u => map.set(u.user_id, u));
            return Array.from(map.values());
          });

          setShowingLimited(data.showingLimited || false);
          setTotalUsers(data.totalUsers || 0);
          setHasMore(data.hasMore || false);
          setPage(pageToFetch);
        }
      } catch (err) {
        console.error('Leaderboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    // reset state when scope or sort changes
    setUsers([]);
    setPage(1);
    setHasMore(true);
    fetchLeaderboard(1, true);
  }, [status, scope, sortBy, sortOrder]);

  // infinite scroll observer
  const lastUserRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore) {
          const fetchMore = async () => {
            setLoading(true);
            try {
              const res = await fetch(
                `/api/leaderboard?scope=${scope}&limit=25&page=${page + 1}&sortBy=${sortBy}&sortOrder=${sortOrder}`
              );
              const data = await res.json();
              if (data.type === 'success') {
                const newUsers: LeaderboardUser[] = data.users || [];
                setUsers(prev => {
                  const map = new Map(prev.map(u => [u.user_id, u]));
                  newUsers.forEach(u => map.set(u.user_id, u));
                  return Array.from(map.values());
                });
                setHasMore(data.hasMore || false);
                setPage(page + 1);
              }
            } catch (err) {
              console.error('Leaderboard fetch error:', err);
            } finally {
              setLoading(false);
            }
          };
          fetchMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore, page, scope, sortBy, sortOrder]
  );

  const handleSort = (key: string) => {
    if (key === 'handicap' || key === 'average_score' || key === 'best_score') {
      if (sortBy === key) setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
      else {
        setSortBy(key);
        setSortOrder('asc');
      }
    }
  };

  // compute tied ranks correctly
  const usersWithTiedRank = (() => {
    const result: (LeaderboardUser & { rankDisplay: string })[] = [];
    let prevValue: number | null = null;
    let rank = 0;       // actual numeric rank
    let tieStartIndex = 0; // index where current tie starts

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const value = sortBy === 'handicap' ? u.handicap
                  : sortBy === 'average_score' ? u.average_score
                  : u.best_score;

      if (value === prevValue) {
        // still tied with previous
        result.push({ ...u, rankDisplay: `T${rank}` });
      } else {
        // new value, check if previous tie
        if (i > tieStartIndex && tieStartIndex < i - 1) {
          // mark all previous tie entries with T
          for (let j = tieStartIndex; j < i; j++) {
            result[j].rankDisplay = `T${rank}`;
          }
        }

        // set rank for this entry
        rank = i + 1;
        tieStartIndex = i;
        prevValue = value;
        result.push({ ...u, rankDisplay: `${rank}` });
      }
    }

    // handle tie at end of list
    if (users.length > tieStartIndex + 1) {
      for (let j = tieStartIndex; j < users.length; j++) {
        result[j].rankDisplay = `T${rank}`;
      }
    }

    return result;
  })();

  if (status === 'loading') return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      <div className="stats-tabs">
        <button className={`stats-tab ${scope === 'global' ? 'active' : ''}`} onClick={() => setScope('global')}>Global</button>
        <button className={`stats-tab ${scope === 'friends' ? 'active' : ''}`} onClick={() => setScope('friends')}>Friends</button>
      </div>

      {scope === 'global' && showingLimited && (
        <div className="info-banner warning">
          <div className="info-banner-content">
            <div className="info-banner-icon"><Crown size={50} /></div>
            <div className="info-banner-text">
              <h4>Want the full picture?</h4>
              <p>
                Currently showing top 50 players out of {totalUsers}. Upgrade to Premium to see the entire global leaderboard and your true ranking.
              </p>
            </div>
            <button className="btn btn-upgrade" onClick={() => router.push('/pricing')}>See Full Leaderboard</button>
          </div>
        </div>
      )}

      <LeaderboardHeader sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />

      {usersWithTiedRank.map((user, index) => {
        const isLast = index === usersWithTiedRank.length - 1;
        return (
          <div key={user.user_id} ref={isLast ? lastUserRef : null}>
            <LeaderboardCard
              user={user}
              rank={user.rank}
              rankDisplay={
                user.user_id === Number(session?.user?.id)
                  ? getCurrentUserRankDisplay(user.rank, 2, showingLimited)
                  : user.rankDisplay
              }
              isCurrentUser={user.user_id === Number(session?.user?.id)}
            />
          </div>
        );
      })}

      {loading && <p className="loading-text">Loading more users...</p>}
    </div>
  );
}

function getCurrentUserRankDisplay(rank: number, topN: number, showingLimited: boolean) {
  if (!showingLimited) return `${rank}`; // premium or full leaderboard
  return rank > topN ? `${rank}+` : `${rank}`;
}