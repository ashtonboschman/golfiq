'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { clearProfileCache } from '@/lib/client/profileCache';
import { clearSubscriptionCache } from '@/hooks/useSubscription';

export default function AuthCacheReset() {
  const { data: session, status } = useSession();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    const userId = session?.user?.id ? String(session.user.id) : null;

    if (status === 'unauthenticated' || !userId) {
      previousUserIdRef.current = null;
      clearProfileCache();
      clearSubscriptionCache();
      return;
    }

    if (previousUserIdRef.current && previousUserIdRef.current !== userId) {
      clearProfileCache(previousUserIdRef.current);
      clearSubscriptionCache(previousUserIdRef.current);
    }

    previousUserIdRef.current = userId;
  }, [session?.user?.id, status]);

  return null;
}
