'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { identifyClientUser, registerClientContext } from '@/lib/analytics/client';

export default function BootstrapClient() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (pathname === '/offline') return;
    if (status !== 'authenticated') return;

    const userId = session?.user?.id;
    if (!userId) return;

    registerClientContext({
      pathname,
      user: {
        id: session.user.id,
        subscription_tier: session.user.subscription_tier,
        auth_provider: session.user.auth_provider,
      },
      isLoggedIn: true,
    });
    identifyClientUser({
      id: session.user.id,
      subscription_tier: session.user.subscription_tier,
      auth_provider: session.user.auth_provider,
    });

    const key = `golfiq_bootstrap_done_${userId}`;
    if (sessionStorage.getItem(key) === '1') return;

    // Mark before request to prevent duplicate calls in dev strict mode.
    sessionStorage.setItem(key, '1');
    fetch('/api/bootstrap', { method: 'POST' }).catch(() => {
      // Allow retry if this request fails.
      sessionStorage.removeItem(key);
    });
  }, [pathname, status, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier]);

  return null;
}
