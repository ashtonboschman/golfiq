'use client';

import { useSubscription } from '@/hooks/useSubscription';
import AdSense from './AdSense';

interface InlineAdBannerProps {
  adSlot: string;
  adLayoutKey?: string;
  className?: string;
}

/**
 * Inline ad banner that only shows for free users
 * Premium users see nothing (ad-free experience)
 *
 * Usage:
 * <InlineAdBanner adSlot="8573051513" adLayoutKey="-fb+5q+57-cn+4i" />
 */
export default function InlineAdBanner({ adSlot, adLayoutKey, className = '' }: InlineAdBannerProps) {
  const { isPremium, loading } = useSubscription();

  // While loading: render invisible placeholder to reserve space and prevent layout shift
  // This prevents footer from jumping when subscription status loads
  if (loading) {
    return <div className={`ad-banner ad-banner-loading ${className}`} />;
  }

  // Premium users: don't show ads
  if (isPremium) {
    return null;
  }

  // Free users: render ad with fixed height container
  return (
    <div className={`ad-banner ${className}`}>
      <AdSense
        adSlot={adSlot}
        adFormat="fluid"
        adLayoutKey={adLayoutKey}
        fullWidthResponsive={true}
      />
    </div>
  );
}
