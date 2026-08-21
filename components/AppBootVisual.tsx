'use client';

import Image from 'next/image';

export default function AppBootVisual() {
  return (
    <div className="app-boot-loader">
      <div className="app-boot-ring" aria-hidden="true" />
      <Image
        src="/logos/favicon/golfiq-icon-512-transparent.png"
        alt="GolfIQ"
        width={70}
        height={70}
        className="app-boot-logo"
        priority
      />
    </div>
  );
}
