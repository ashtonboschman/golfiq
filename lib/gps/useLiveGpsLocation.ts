'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { metersToYards } from '@/lib/gps/distance';
import { MAX_USABLE_LIVE_GPS_ACCURACY_YARDS } from '@/lib/gps/liveRoute';
import type { AcceptedGpsFix, CurrentLocationState } from '@/lib/gps/types';

const INITIAL_LOCATION_STATE: CurrentLocationState = {
  status: 'idle',
  position: null,
  accuracyMeters: null,
  timestamp: null,
  message: null,
};

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
  );
}

function isUsableAccuracy(accuracyMeters: number) {
  return (
    Number.isFinite(accuracyMeters)
    && accuracyMeters >= 0
    && metersToYards(accuracyMeters) <= MAX_USABLE_LIVE_GPS_ACCURACY_YARDS
  );
}

function locationFromAcceptedFix(
  fix: AcceptedGpsFix,
  status: CurrentLocationState['status'] = 'granted',
): CurrentLocationState {
  return {
    status,
    position: {
      lat: fix.latitude,
      lng: fix.longitude,
    },
    accuracyMeters: fix.accuracyMeters,
    timestamp: fix.timestamp,
    message: null,
  };
}

function unavailableLocationState(): CurrentLocationState {
  return {
    status: 'unavailable',
    position: null,
    accuracyMeters: null,
    timestamp: null,
    message: 'Location unavailable. You can still use the hole map.',
  };
}

function deniedLocationState(): CurrentLocationState {
  return {
    status: 'denied',
    position: null,
    accuracyMeters: null,
    timestamp: null,
    message: 'Location unavailable. You can still use the hole map.',
  };
}

function errorLocationState(error: GeolocationPositionError): CurrentLocationState {
  if (error.code === 1) return deniedLocationState();
  return unavailableLocationState();
}

export function useLiveGpsLocation(active: boolean) {
  const [location, setLocation] = useState<CurrentLocationState>(INITIAL_LOCATION_STATE);
  const watchIdRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  const acceptedFixRef = useRef<AcceptedGpsFix | null>(null);
  const fallbackTimestampRef = useRef(0);

  const stopWatch = useCallback((generation?: number) => {
    if (
      generation !== undefined
      && activeGenerationRef.current !== generation
    ) {
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    activeGenerationRef.current = null;
  }, []);

  const resolvePositionTimestamp = useCallback((position: GeolocationPosition) => {
    const rawTimestamp = (position as { timestamp?: unknown }).timestamp;
    if (
      typeof rawTimestamp === 'number'
      && Number.isFinite(rawTimestamp)
      && rawTimestamp >= 0
    ) {
      fallbackTimestampRef.current = Math.max(fallbackTimestampRef.current, rawTimestamp);
      return rawTimestamp;
    }

    const retainedTimestamp = acceptedFixRef.current?.timestamp ?? 0;
    fallbackTimestampRef.current = Math.max(
      fallbackTimestampRef.current + 1,
      retainedTimestamp + 1,
    );
    return fallbackTimestampRef.current;
  }, []);

  const acceptedFixFromPosition = useCallback((position: GeolocationPosition) => {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracyMeters = position.coords.accuracy;

    if (!isValidCoordinate(latitude, longitude)) return null;
    if (!isUsableAccuracy(accuracyMeters)) return null;

    const timestamp = resolvePositionTimestamp(position);
    const retainedFix = acceptedFixRef.current;
    if (retainedFix && timestamp <= retainedFix.timestamp) return null;

    return {
      latitude,
      longitude,
      accuracyMeters,
      timestamp,
    };
  }, [resolvePositionTimestamp]);

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

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      activeGenerationRef.current = generation;
      setLocation((current) => (
        acceptedFixRef.current
          ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
          : {
            ...current,
            status: 'watching',
            position: null,
            accuracyMeters: null,
            timestamp: null,
            message: null,
          }
      ));

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (disposed || activeGenerationRef.current !== generation) return;

          const acceptedFix = acceptedFixFromPosition(position);
          if (!acceptedFix) {
            setLocation((current) => (
              acceptedFixRef.current
                ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
                : current
            ));
            return;
          }

          acceptedFixRef.current = acceptedFix;
          setLocation(locationFromAcceptedFix(acceptedFix));
        },
        (error) => {
          if (disposed || activeGenerationRef.current !== generation) return;

          stopWatch(generation);
          setLocation(acceptedFixRef.current
            ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
            : errorLocationState(error));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000,
        },
      );
      if (activeGenerationRef.current === generation) {
        watchIdRef.current = watchId;
      } else {
        navigator.geolocation.clearWatch(watchId);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopWatch();
        if (acceptedFixRef.current) {
          setLocation(locationFromAcceptedFix(acceptedFixRef.current, 'stale'));
        }
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
  }, [acceptedFixFromPosition, active, stopWatch]);

  return {
    location,
  };
}
