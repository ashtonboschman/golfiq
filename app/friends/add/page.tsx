'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useFriends } from '@/context/FriendsContext';
import FriendCard from '@/components/FriendCard';
import { FriendUser } from '@/lib/friendUtils';

export default function AddFriendsPage() {
  const { data: session, status } = useSession();
  const { friends, incomingRequests, outgoingRequests, handleAction } = useFriends();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);

        if (res.status === 401 || res.status === 403) {
          router.replace('/login');
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Search failed');

        // Merge search results with actual requests / friends
        const merged = data.results.map((user: any) => {
          const friend = friends.find((f) => f.user_id === user.id);
          if (friend) return friend;

          const incoming = incomingRequests.find((r) => r.user_id === user.id);
          if (incoming) return incoming;

          const outgoing = outgoingRequests.find((r) => r.user_id === user.id);
          if (outgoing) return outgoing;

          return { ...user, type: 'none', id: user.id };
        });

        setResults(merged);
      } catch (err: any) {
        console.error('Search failed:', err.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [friends, incomingRequests, outgoingRequests, router]
  );

  // Debounce search
  useEffect(() => {
    const delay = setTimeout(() => searchUsers(search), 300);
    return () => clearTimeout(delay);
  }, [search, searchUsers]);

  const handleAddClick = async (userId: number) => {
    const user = results.find((u) => u.user_id === userId || u.id === userId);
    if (!user) return;

    // Optimistically mark as outgoing
    setResults((prev) =>
      prev.map((u) =>
        u.user_id === userId || u.id === userId ? { ...u, type: 'outgoing' as const } : u
      )
    );

    await handleAction(userId, 'send', {
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
    });
  };

  if (status === 'loading') return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      <input
        type="text"
        placeholder="Search users by first name or last name"
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

      {loading && <p className='loading-text'>Searching...</p>}

      {results.map((user) => (
        <FriendCard
          key={user.id}
          friend={user}
          onAction={(id, action) => {
            if (action === 'send') return handleAddClick(id);
            return handleAction(id, action);
          }}
          showDetails={false}
        />
      ))}

      {!loading && search && results.length === 0 && <p className='loading-text'>No users found</p>}
    </div>
  );
}
