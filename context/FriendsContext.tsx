'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { normalizeFriend, FriendUser } from '@/lib/friendUtils';

interface FriendsContextType {
  friends: FriendUser[];
  incomingRequests: FriendUser[];
  outgoingRequests: FriendUser[];
  loading: boolean;
  handleAction: (id: number, action: string, extra?: any) => Promise<void>;
  fetchAll: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export const useFriends = () => {
  const context = useContext(FriendsContext);
  if (!context) {
    throw new Error('useFriends must be used within FriendsProvider');
  }
  return context;
};

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { showMessage, clearMessage } = useMessage();

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendUser[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedForUserRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const fetchAll = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setLoading(false);
      return;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = (async () => {
      setLoading(true);
      clearMessage();

      try {
        const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
          fetch('/api/friends'),
          fetch('/api/friends/incoming'),
          fetch('/api/friends/outgoing'),
        ]);

        const [friendsData, incomingData, outgoingData] = await Promise.all([
          friendsRes.json(),
          incomingRes.json(),
          outgoingRes.json(),
        ]);

        if (friendsData.type === 'success') {
          setFriends(
            friendsData.results.map((u: any) =>
              normalizeFriend({ ...u, id: u.id, user_id: u.id, type: 'friend' })
            )
          );
        } else {
          console.warn('Friends fetch failed:', friendsData.message);
          setFriends([]);
        }

        if (incomingData.type === 'success') {
          setIncomingRequests(
            incomingData.results.map((u: any) =>
              normalizeFriend({ ...u, type: 'incoming' })
            )
          );
        } else {
          console.warn('Incoming requests fetch failed:', incomingData.message);
          setIncomingRequests([]);
        }

        if (outgoingData.type === 'success') {
          setOutgoingRequests(
            outgoingData.results.map((u: any) =>
              normalizeFriend({ ...u, type: 'outgoing' })
            )
          );
        } else {
          console.warn('Outgoing requests fetch failed:', outgoingData.message);
          setOutgoingRequests([]);
        }
      } catch (err: any) {
        console.error(err);
        showMessage(err.message || 'Failed to fetch friends', 'error');
      } finally {
        setLoading(false);
      }
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [status, session?.user?.id, clearMessage, showMessage]);

  const userId = session?.user?.id ? String(session.user.id) : null;
  useEffect(() => {
    if (status !== 'authenticated' || !userId) {
      hasLoadedForUserRef.current = null;
      inFlightRef.current = null;
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setLoading(false);
      return;
    }

    if (hasLoadedForUserRef.current === userId) return;

    if (hasLoadedForUserRef.current && hasLoadedForUserRef.current !== userId) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setLoading(true);
    }

    hasLoadedForUserRef.current = userId;
    fetchAll().catch(() => undefined);
  }, [status, userId, fetchAll]);

  const handleAction = async (id: number, action: string, extra: any = {}) => {
    try {
      let url: string;
      let method = 'POST';
      let body: string | undefined;

      switch (action) {
        case 'send':
          url = '/api/friends';
          body = JSON.stringify({ recipientId: id });
          break;
        case 'accept':
          url = `/api/friends/${id}/accept`;
          break;
        case 'decline':
          url = `/api/friends/${id}/decline`;
          break;
        case 'cancel':
          url = `/api/friends/${id}/cancel`;
          break;
        case 'remove':
          url = `/api/friends/${id}`;
          method = 'DELETE';
          break;
        default:
          throw new Error('Invalid action');
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      const data = await res.json();
      showMessage(data.message, data.type);
      if (data.type !== 'success') throw new Error(data.message);

      switch (action) {
        case 'send': {
          const request = data.request;
          if (!request) {
            console.error('No request data returned from API');
            break;
          }

          // Preserve stats from the original friend object (extra parameter)
          // API doesn't return stats, so we must explicitly preserve them
          const normalized = normalizeFriend({
            id: request.id,
            user_id: request.user_id,
            first_name: request.first_name,
            last_name: request.last_name,
            avatar_url: request.avatar_url,
            type: 'outgoing',
            created_at: request.created_at,
            // Preserve stats from extra (the original friend card data)
            handicap: extra?.handicap ?? null,
            average_score: extra?.average_score ?? null,
            best_score: extra?.best_score ?? null,
            total_rounds: extra?.total_rounds ?? null,
          });

          setOutgoingRequests((prev) => [normalized, ...prev]);
          setIncomingRequests((prev) => prev.filter((r) => r.user_id !== normalized.user_id));
          setFriends((prev) => prev.filter((f) => f.user_id !== normalized.user_id));
          break;
        }

        case 'accept': {
          const friend = data.friend || extra;
          if (!friend) break;

          const normalized = normalizeFriend({
            ...friend,
            id: friend.id,
            user_id: friend.id,
            type: 'friend',
          });
          setFriends((prev) => [...prev.filter((f) => f.id !== normalized.id), normalized]);
          setIncomingRequests((prev) => prev.filter((r) => r.id !== id));
          break;
        }

        case 'decline':
          setIncomingRequests((prev) => prev.filter((r) => r.id !== id));
          break;

        case 'cancel':
          setOutgoingRequests((prev) => prev.filter((r) => r.id !== id));
          break;

        case 'remove':
          setFriends((prev) => prev.filter((f) => f.id !== id));
          break;
      }
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Action failed', 'error');
    }
  };

  return (
    <FriendsContext.Provider
      value={{
        friends,
        incomingRequests,
        outgoingRequests,
        loading,
        handleAction,
        fetchAll,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}
