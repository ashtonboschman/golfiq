'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

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
  const { status } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchAvatar = async () => {
      if (status !== 'authenticated') return;

      try {
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const data = await res.json();
          setAvatarUrl(data.user.avatar_url);
        }
      } catch (err) {
        console.error('Error fetching avatar:', err);
      }
    };

    fetchAvatar();
  }, [status]);

  const updateAvatar = (url: string | null) => {
    setAvatarUrl(url);
  };

  return (
    <AvatarContext.Provider value={{ avatarUrl, updateAvatar }}>
      {children}
    </AvatarContext.Provider>
  );
}
