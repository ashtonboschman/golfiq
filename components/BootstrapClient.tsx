'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function BootstrapClient() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (pathname === '/offline') return;
    if (status !== 'authenticated') return;

    const userId = session?.user?.id;
    if (!userId) return;

    const key = `golfiq_bootstrap_done_${userId}`;
    if (sessionStorage.getItem(key) === '1') return;

    // Mark before request to prevent duplicate calls in dev strict mode.
    sessionStorage.setItem(key, '1');
    fetch('/api/bootstrap', { method: 'POST' }).catch(() => {
      // Allow retry if this request fails.
      sessionStorage.removeItem(key);
    });
  }, [pathname, status, session?.user?.id]);

  return null;
}
