'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestCurrentGpsFix } from '@/lib/gps/currentLocation';

type AdminGpsMappingLocationSortProps = {
  hasLocation: boolean;
  query: string;
  status: string;
};

export default function AdminGpsMappingLocationSort({
  hasLocation,
  query,
  status,
}: AdminGpsMappingLocationSortProps) {
  const router = useRouter();

  useEffect(() => {
    if (hasLocation) return;

    let active = true;

    void requestCurrentGpsFix({
      timeout: 1000,
      maximumAge: 300000,
    }).then((fix) => {
      if (!active || !fix) return;

      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (status !== 'ALL') params.set('status', status);
      params.set('lat', fix.position.lat.toString());
      params.set('lng', fix.position.lng.toString());

      router.replace(`/admin/gps-mapping?${params.toString()}`, { scroll: false });
    });

    return () => {
      active = false;
    };
  }, [hasLocation, query, router, status]);

  return null;
}
