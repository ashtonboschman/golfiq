'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurrentLocationState } from '@/lib/gps/types';

const INITIAL_LOCATION_STATE: CurrentLocationState = {
  status: 'idle',
  position: null,
  accuracyMeters: null,
  message: null,
};

function unavailableLocationState(): CurrentLocationState {
  return {
    status: 'unavailable',
    position: null,
    accuracyMeters: null,
    message: 'Location unavailable. You can still use the hole map.',
  };
}

export function useLiveGpsLocation(active: boolean) {
  const [location, setLocation] = useState<CurrentLocationState>(INITIAL_LOCATION_STATE);
  const watchIdRef = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current === null) return;
    navigator.geolocation?.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      stopWatch();
      return;
    }

    if (
      typeof document === 'undefined'
      || typeof navigator === 'undefined'
      || !navigator.geolocation
    ) {
      return;
    }

    let disposed = false;

    const startWatch = () => {
      if (disposed || document.hidden || watchIdRef.current !== null) return;

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setLocation({
            status: 'granted',
            position: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
            accuracyMeters: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null,
            message: null,
          });
        },
        () => {
          stopWatch();
          setLocation(unavailableLocationState());
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000,
        },
      );
      watchIdRef.current = watchId;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopWatch();
        return;
      }

      startWatch();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startWatch();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopWatch();
    };
  }, [active, stopWatch]);

  return {
    location,
  };
}
