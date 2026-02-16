'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFriends } from '@/context/FriendsContext';
import FriendCard from '@/components/FriendCard';
import PullToRefresh from '@/components/PullToRefresh';
import { Plus } from 'lucide-react';

function FriendCardSkeleton({ request = false }: { request?: boolean }) {
  return (
    <div className="friend-card" aria-hidden="true">
      <div className="friend-info">
        <span className="skeleton" style={{ width: 48, height: 48, borderRadius: 999 }} />
        <div className="friend-details">
          <span className="skeleton" style={{ display: 'inline-block', width: '44%', height: 16 }} />
          <div className="friend-stats">
            <span className="skeleton" style={{ display: 'inline-block', width: 62, height: 12 }} />
            <span className="skeleton" style={{ display: 'inline-block', width: 62, height: 12 }} />
            <span className="skeleton" style={{ display: 'inline-block', width: 62, height: 12 }} />
            <span className="skeleton" style={{ display: 'inline-block', width: 62, height: 12 }} />
          </div>
        </div>
      </div>
      <div className="friend-actions">
        {request ? (
          <>
            <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          </>
        ) : (
          <span className="skeleton" style={{ width: 20, height: 20, borderRadius: 999 }} />
        )}
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const { friends, incomingRequests, outgoingRequests, loading, handleAction, fetchAll } = useFriends();
  const [search, setSearch] = useState('');
  const router = useRouter();

  // Combine all friends and requests for search
  const allUsers = [...friends, ...incomingRequests, ...outgoingRequests];

  const filteredUsers = search
    ? allUsers.filter(
        (u) =>
          (u.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (u.last_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : allUsers;

  // Split back into sections for display
  const filteredIncoming = filteredUsers.filter((u) => u.type === 'incoming');
  const filteredOutgoing = filteredUsers.filter((u) => u.type === 'outgoing');
  const filteredFriends = filteredUsers.filter((u) => u.type === 'friend');

  const handleRefresh = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="page-stack">
      <div className="flex space-between">
        <button className="btn btn-add" onClick={() => router.push('/friends/add')}>
          <Plus/> Add Friend
        </button>
      </div>

      <>
        <div className="card">
          <h3>{loading ? 'Friend Requests' : `Friend Requests (${filteredIncoming.length + filteredOutgoing.length})`}</h3>
          {loading ? (
            Array.from({ length: 2 }).map((_, idx) => (
              <FriendCardSkeleton key={`friend-requests-skeleton-${idx}`} request />
            ))
          ) : (
            [...filteredIncoming, ...filteredOutgoing].map((user) => (
              <FriendCard key={user.id} friend={user} onAction={handleAction} />
            ))
          )}
        </div>

        <div className="card">
          <h3>{loading ? 'Friends' : `Friends (${filteredFriends.length})`}</h3>
          <input
            type="text"
            placeholder="Search Friends"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading}
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
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <FriendCardSkeleton key={`friends-list-skeleton-${idx}`} />
            ))
          ) : (
            filteredFriends.map((friend) => (
              <FriendCard key={friend.id} friend={friend} onAction={handleAction} />
            ))
          )}
        </div>
      </>
    </div>
    </PullToRefresh>
  );
}
