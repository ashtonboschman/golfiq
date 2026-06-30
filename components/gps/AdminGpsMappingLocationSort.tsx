'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type AdminGpsMappingLocationSortProps = {
  hasLocation: boolean;
  query: string;
};

export default function AdminGpsMappingLocationSort({
  hasLocation,
  query,
}: AdminGpsMappingLocationSortProps) {
  const router = useRouter();

  useEffect(() => {
    if (hasLocation || !navigator.geolocation) return;

    let active = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;

        const params = new URLSearchParams();
        if (query) params.set('q', query);
        params.set('lat', position.coords.latitude.toString());
        params.set('lng', position.coords.longitude.toString());

        router.replace(`/admin/gps-mapping?${params.toString()}`, { scroll: false });
      },
      () => {
        // Fall back to alphabetical sorting when location is unavailable or denied.
      },
      {
        timeout: 1000,
        maximumAge: 300000,
      },
    );

    return () => {
      active = false;
    };
  }, [hasLocation, query, router]);

  return null;
}
