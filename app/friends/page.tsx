'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFriends } from '@/context/FriendsContext';
import FriendCard from '@/components/FriendCard';
import PullToRefresh from '@/components/PullToRefresh';
import { Plus } from 'lucide-react';

export default function FriendsPage() {
  const { friends, incomingRequests, outgoingRequests, loading, handleAction, fetchAll } = useFriends();
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchAll();
  }, []);

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

      {loading ? (
        <p className='loading-text'>Loading friends...</p>
      ) : (
        <>
          <div className="card">
            <h3>Friend Requests ({filteredIncoming.length + filteredOutgoing.length})</h3>
            {[...filteredIncoming, ...filteredOutgoing].map((user) => (
              <FriendCard key={user.id} friend={user} onAction={handleAction} />
            ))}
          </div>

          <div className="card">
            <h3>Friends ({filteredFriends.length})</h3>
            <input
              type="text"
              placeholder="Search Friends"
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
            {filteredFriends.map((friend) => (
              <FriendCard key={friend.id} friend={friend} onAction={handleAction} />
            ))}
          </div>
        </>
      )}
    </div>
    </PullToRefresh>
  );
}
