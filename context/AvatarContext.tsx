'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { fetchProfileCached } from '@/lib/client/profileCache';

interface AvatarContextType {
  avatarUrl: string | null;
  updateAvatar: (url: string | null) => void;
}

const AvatarContext = createContext<AvatarContextType | undefined>(undefined);

export const useAvatar = () => {
  const context = useContext(AvatarContext);
  if (!context) {
    throw new Error('useAvatar must be used within AvatarProvider');
  }
  return context;
};

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const sessionAvatarUrl = session?.user?.avatar_url ?? null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated' || !userId) {
      previousUserIdRef.current = null;
      setAvatarUrl(null);
      return;
    }

    const userChanged = previousUserIdRef.current !== userId;
    previousUserIdRef.current = userId;
    if (userChanged) {
      setAvatarUrl(sessionAvatarUrl);
    }

    let canceled = false;
    const fetchAvatar = async () => {
      try {
        const data = await fetchProfileCached(userId);
        if (!canceled && data?.profile) {
          setAvatarUrl(data.profile.avatar_url);
        }
      } catch (err) {
        console.error('Error fetching avatar:', err);
      }
    };

    fetchAvatar();
    return () => {
      canceled = true;
    };
  }, [status, userId, sessionAvatarUrl]);

  const updateAvatar = (url: string | null) => {
    setAvatarUrl(url);
  };

  return (
    <AvatarContext.Provider value={{ avatarUrl, updateAvatar }}>
      {children}
    </AvatarContext.Provider>
  );
}
