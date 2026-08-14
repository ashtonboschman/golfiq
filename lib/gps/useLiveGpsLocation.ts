'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { metersToYards } from '@/lib/gps/distance';
import { MAX_USABLE_LIVE_GPS_ACCURACY_YARDS } from '@/lib/gps/liveRoute';
import {
  ensureNativeBackgroundGpsPermission,
  isNativeBackgroundGpsAvailable,
  startNativeBackgroundGps,
  stopNativeBackgroundGps,
} from '@/lib/gps/nativeBackgroundLocation';
import type { AcceptedGpsFix, CurrentLocationState } from '@/lib/gps/types';

export type LiveGpsLocationSource = 'watch_position' | 'native_background';
type LiveGpsWatchDriver = 'browser_watch' | 'native_background';

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

function nativeErrorLocationState(error: { code?: string }): CurrentLocationState {
  const code = error.code?.toUpperCase() ?? '';
  if (code.includes('AUTHORIZED') || code.includes('PERMISSION')) {
    return deniedLocationState();
  }
  return unavailableLocationState();
}

export function useLiveGpsLocation(active: boolean) {
  const [location, setLocation] = useState<CurrentLocationState>(INITIAL_LOCATION_STATE);
  const watchIdRef = useRef<number | null>(null);
  const watchSourceRef = useRef<LiveGpsWatchDriver | null>(null);
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
    if (watchSourceRef.current === 'native_background') {
      void stopNativeBackgroundGps().catch(() => undefined);
    }
    watchIdRef.current = null;
    watchSourceRef.current = null;
    activeGenerationRef.current = null;
  }, []);

  const resolvePositionTimestamp = useCallback((rawTimestamp: unknown) => {
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

  const acceptedFixFromValues = useCallback(({
    latitude,
    longitude,
    accuracyMeters,
    timestamp: rawTimestamp,
  }: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    timestamp: unknown;
  }) => {
    if (!isValidCoordinate(latitude, longitude)) return null;
    if (!isUsableAccuracy(accuracyMeters)) return null;

    const timestamp = resolvePositionTimestamp(rawTimestamp);
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

    if (typeof document === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    let disposed = false;

    const nativeBackgroundAvailable = isNativeBackgroundGpsAvailable();
    if (!nativeBackgroundAvailable && !navigator.geolocation) return;

    const updateFromValues = (values: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      timestamp: unknown;
    }, generation: number) => {
      if (disposed || activeGenerationRef.current !== generation) return;

      const acceptedFix = acceptedFixFromValues(values);
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
    };

    const prepareWatch = (source: LiveGpsWatchDriver) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      activeGenerationRef.current = generation;
      watchSourceRef.current = source;
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
      return generation;
    };

    const startNativeWatch = () => {
      if (disposed || document.hidden || watchSourceRef.current !== null) return;

      const generation = prepareWatch('native_background');
      void ensureNativeBackgroundGpsPermission()
        .then((permissionGranted) => {
          if (disposed || activeGenerationRef.current !== generation) return;

          if (!permissionGranted) {
            stopWatch(generation);
            setLocation(acceptedFixRef.current
              ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
              : deniedLocationState());
            return;
          }

          return startNativeBackgroundGps({
            onPosition: (position) => {
              updateFromValues({
                latitude: position.latitude,
                longitude: position.longitude,
                accuracyMeters: position.accuracy,
                timestamp: position.time,
              }, generation);
            },
            onError: (error) => {
              if (disposed || activeGenerationRef.current !== generation) return;

              stopWatch(generation);
              setLocation(acceptedFixRef.current
                ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
                : nativeErrorLocationState(error));
            },
          });
        })
        .catch(() => {
          if (disposed || activeGenerationRef.current !== generation) return;

          stopWatch(generation);
          setLocation(acceptedFixRef.current
            ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
            : unavailableLocationState());
        });
    };

    const startBrowserWatch = () => {
      if (disposed || document.hidden || watchSourceRef.current !== null) return;

      const generation = prepareWatch('browser_watch');

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateFromValues({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            timestamp: position.timestamp,
          }, generation);
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

    const requestFreshBrowserFix = () => {
      if (
        disposed
        || document.hidden
        || watchSourceRef.current !== 'browser_watch'
        || activeGenerationRef.current === null
      ) {
        return;
      }

      const generation = activeGenerationRef.current;
      navigator.geolocation.getCurrentPosition?.(
        (position) => {
          updateFromValues({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            timestamp: position.timestamp,
          }, generation);
        },
        () => {
          // The continuous watcher remains the source of truth if the eager
          // resume request times out or cannot produce a fix.
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 12000,
        },
      );
    };

    const startWatch = nativeBackgroundAvailable ? startNativeWatch : startBrowserWatch;
    let wasDocumentHidden = document.hidden;

    const handleVisibilityChange = () => {
      const isDocumentHidden = document.hidden;
      if (isDocumentHidden === wasDocumentHidden) return;
      wasDocumentHidden = isDocumentHidden;

      if (isDocumentHidden) {
        if (nativeBackgroundAvailable) return;

        stopWatch();
        if (acceptedFixRef.current) {
          setLocation(locationFromAcceptedFix(acceptedFixRef.current, 'stale'));
        }
        return;
      }

      startWatch();
      if (!nativeBackgroundAvailable) {
        setLocation((current) => (
          acceptedFixRef.current
            ? locationFromAcceptedFix(acceptedFixRef.current, 'stale')
            : { ...current, status: 'watching', message: null }
        ));
        requestFreshBrowserFix();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startWatch();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopWatch();
    };
  }, [acceptedFixFromValues, active, stopWatch]);

  const source: LiveGpsLocationSource = isNativeBackgroundGpsAvailable()
    ? 'native_background'
    : 'watch_position';

  return {
    location,
    source,
  };
}
