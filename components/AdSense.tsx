'use client';

import { Siren } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface AdSenseProps {
  adSlot: string;
  adFormat?: 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal';
  adLayoutKey?: string;
  fullWidthResponsive?: boolean;
}

/**
 * Google AdSense component
 *
 * Setup instructions:
 * 1. Apply for Google AdSense: https://www.google.com/adsense
 * 2. Get approved and obtain your Publisher ID
 * 3. Add to .env: NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-XXXXXXXXXXXXXXXX
 * 4. Add AdSense script to app/layout.tsx head
 * 5. Create ad units in AdSense dashboard and use slot IDs here
 */
export default function AdSense({
  adSlot,
  adFormat = 'fluid',
  adLayoutKey,
  fullWidthResponsive = true,
}: AdSenseProps) {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
  const adPushed = useRef(false);

  useEffect(() => {
    // Push ad to AdSense queue only once
    if (adPushed.current) return;

    try {
      if (typeof window !== 'undefined' && publisherId) {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
        adPushed.current = true;
      }
    } catch (error) {
      console.error('AdSense error:', error);
    }
  }, [publisherId]);

  // Don't render ads if no publisher ID (development mode)
  if (!publisherId) {
    return (
      <div className="ad-placeholder">
        <div><Siren/> Ad Placeholder</div>
        <div className="ad-placeholder-text">
          AdSense Publisher ID not configured
        </div>
      </div>
    );
  }

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={publisherId}
      data-ad-slot={adSlot}
      data-ad-format={adFormat}
      data-ad-layout-key={adLayoutKey}
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
    />
  );
}
