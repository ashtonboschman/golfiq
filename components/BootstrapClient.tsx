'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { identifyClientUser, registerClientContext } from '@/lib/analytics/client';

export default function BootstrapClient() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const subscriptionStatus = (session?.user as any)?.subscription_status ?? null;
  const profileTimezone =
    typeof session?.user?.timezone === 'string' && session.user.timezone.trim().length > 0
      ? session.user.timezone
      : null;

  useEffect(() => {
    if (pathname === '/offline') return;
    if (status !== 'authenticated') return;

    const userId = session?.user?.id;
    if (!userId) return;

    registerClientContext({
      pathname,
      user: {
        id: session.user.id,
        email: session.user.email ?? null,
        first_name: session.user.first_name ?? null,
        last_name: session.user.last_name ?? null,
        subscription_tier: session.user.subscription_tier,
        subscription_status: subscriptionStatus,
        auth_provider: session.user.auth_provider,
        timezone: profileTimezone,
      },
      isLoggedIn: true,
    });
    identifyClientUser({
      id: session.user.id,
      email: session.user.email ?? null,
      first_name: session.user.first_name ?? null,
      last_name: session.user.last_name ?? null,
      subscription_tier: session.user.subscription_tier,
      subscription_status: subscriptionStatus,
      auth_provider: session.user.auth_provider,
      timezone: profileTimezone,
    });

    const key = `golfiq_bootstrap_done_${userId}`;
    if (sessionStorage.getItem(key) === '1') return;

    // Mark before request to prevent duplicate calls in dev strict mode.
    sessionStorage.setItem(key, '1');
    fetch('/api/bootstrap', { method: 'POST' }).catch(() => {
      // Allow retry if this request fails.
      sessionStorage.removeItem(key);
    });
  }, [
    pathname,
    profileTimezone,
    session?.user,
    status,
    session?.user?.auth_provider,
    session?.user?.email,
    session?.user?.first_name,
    session?.user?.id,
    session?.user?.last_name,
    session?.user?.subscription_tier,
    subscriptionStatus,
  ]);

  return null;
}
