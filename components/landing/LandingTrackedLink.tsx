'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

type LandingTrackedLinkProps = {
  href: string;
  className: string;
  ctaName: 'get_started' | 'login' | 'pricing' | 'start_free' | 'view_full_pricing' | 'view_pricing';
  ctaLocation: string;
  children: ReactNode;
};

export default function LandingTrackedLink({
  href,
  className,
  ctaName,
  ctaLocation,
  children,
}: LandingTrackedLinkProps) {
  const trackClick = () => {
    captureClientEvent(
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: ctaName,
        cta_location: ctaLocation,
        destination: href,
      },
      { pathname: '/' },
    );
  };

  return (
    <Link href={href} className={className} onClick={trackClick}>
      {children}
    </Link>
  );
}
