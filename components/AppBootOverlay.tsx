'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import AppBootVisual from './AppBootVisual';

const PUBLIC_ROUTES = new Set([
  '/',
  '/onboarding',
  '/post-signup',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/about',
  '/privacy',
  '/terms',
  '/contact',
  '/verify-email',
]);

export default function AppBootOverlay() {
  const { status } = useSession();
  const pathname = usePathname();
  const [holdUnauthOverlay, setHoldUnauthOverlay] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    let startTimer: number | null = null;
    let endTimer: number | null = null;

    if (isPublicRoute) {
      startTimer = window.setTimeout(() => setHoldUnauthOverlay(false), 0);
    } else if (status === 'unauthenticated') {
      startTimer = window.setTimeout(() => setHoldUnauthOverlay(true), 0);
      endTimer = window.setTimeout(() => setHoldUnauthOverlay(false), 1000);
    } else {
      startTimer = window.setTimeout(() => setHoldUnauthOverlay(false), 0);
    }

    return () => {
      if (startTimer != null) window.clearTimeout(startTimer);
      if (endTimer != null) window.clearTimeout(endTimer);
    };
  }, [isPublicRoute, status, pathname]);

  const showOverlay = !isPublicRoute && (status === 'loading' || holdUnauthOverlay);

  if (!showOverlay) return null;

  return (
    <div className="app-boot-overlay" role="status" aria-live="polite" aria-label="Loading">
      <AppBootVisual />
    </div>
  );
}
