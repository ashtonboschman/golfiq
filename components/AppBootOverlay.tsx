'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/about',
  '/privacy',
  '/terms',
  '/contact',
  '/waitlist-confirm',
  '/verify-email',
]);

export default function AppBootOverlay() {
  const { status } = useSession();
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const showOverlay = !isPublicRoute && status === 'loading';

  if (!showOverlay) return null;

  return (
    <div className="app-boot-overlay" role="status" aria-live="polite" aria-label="Loading">
      <div className="app-boot-loader">
        <div className="app-boot-ring" aria-hidden="true" />
        <Image
          src="/logos/favicon/golfiq-icon-512.png"
          alt="GolfIQ"
          width={40}
          height={40}
          className="app-boot-logo"
          priority
        />
      </div>
    </div>
  );
}

