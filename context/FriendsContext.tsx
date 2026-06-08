'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { normalizeFriend, FriendUser } from '@/lib/friendUtils';
import { FriendAcceptedNotification } from '@/lib/friendNotifications';

interface FriendsContextType {
  friends: FriendUser[];
  incomingRequests: FriendUser[];
  outgoingRequests: FriendUser[];
  acceptedNotifications: FriendAcceptedNotification[];
  unreadAcceptedNotificationsCount: number;
  loading: boolean;
  handleAction: (id: number, action: string, extra?: any) => Promise<void>;
  fetchAll: () => Promise<void>;
  markAcceptedNotificationsRead: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export const useFriends = () => {
  const context = useContext(FriendsContext);
  if (!context) {
    throw new Error('useFriends must be used within FriendsProvider');
  }
  return context;
};

export const useOptionalFriends = () => useContext(FriendsContext);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { showMessage, clearMessage } = useMessage();

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendUser[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendUser[]>([]);
  const [acceptedNotifications, setAcceptedNotifications] = useState<FriendAcceptedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedForUserRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const fetchAll = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setAcceptedNotifications([]);
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
        const [friendsRes, incomingRes, outgoingRes, notificationsRes] = await Promise.all([
          fetch('/api/friends'),
          fetch('/api/friends/incoming'),
          fetch('/api/friends/outgoing'),
          fetch('/api/friends/notifications'),
        ]);

        const [friendsData, incomingData, outgoingData, notificationsData] = await Promise.all([
          friendsRes.json(),
          incomingRes.json(),
          outgoingRes.json(),
          notificationsRes.json(),
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

        if (notificationsData.type === 'success') {
          setAcceptedNotifications(
            notificationsData.results.map((notification: FriendAcceptedNotification) => ({
              ...notification,
            }))
          );
        } else {
          console.warn('Friend notifications fetch failed:', notificationsData.message);
          setAcceptedNotifications([]);
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
      setAcceptedNotifications([]);
      setLoading(false);
      return;
    }

    if (hasLoadedForUserRef.current === userId) return;

    if (hasLoadedForUserRef.current && hasLoadedForUserRef.current !== userId) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setAcceptedNotifications([]);
      setLoading(true);
    }

    hasLoadedForUserRef.current = userId;
    fetchAll().catch(() => undefined);
  }, [status, userId, fetchAll]);

  const markAcceptedNotificationsRead = useCallback(async () => {
    const unreadIds = acceptedNotifications
      .filter((notification) => notification.read_at === null)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      return;
    }

    try {
      const res = await fetch('/api/friends/notifications', {
        method: 'POST',
      });
      const data = await res.json();

      if (data.type !== 'success') {
        throw new Error(data.message || 'Failed to mark notifications as read');
      }

      const readAt = typeof data.readAt === 'string' ? data.readAt : new Date().toISOString();

      setAcceptedNotifications((prev) =>
        prev.map((notification) =>
          unreadIds.includes(notification.id)
            ? { ...notification, read_at: readAt }
            : notification
        )
      );
    } catch (error) {
      console.error('Failed to mark friend notifications as read:', error);
    }
  }, [acceptedNotifications]);

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

  const unreadAcceptedNotificationsCount = acceptedNotifications.filter(
    (notification) => notification.read_at === null
  ).length;

  return (
    <FriendsContext.Provider
      value={{
        friends,
        incomingRequests,
        outgoingRequests,
        acceptedNotifications,
        unreadAcceptedNotificationsCount,
        loading,
        handleAction,
        fetchAll,
        markAcceptedNotificationsRead,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}
