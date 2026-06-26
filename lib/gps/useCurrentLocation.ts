'use client';

import { useEffect, useState } from 'react';
import type { CurrentLocationState } from '@/lib/gps/types';

const INITIAL_LOCATION_STATE: CurrentLocationState = {
  status: 'idle',
  position: null,
  accuracyMeters: null,
  message: null,
};

function geolocationErrorMessage(error: GeolocationPositionError): CurrentLocationState {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      status: 'denied',
      position: null,
      accuracyMeters: null,
      message: 'Location permission is denied. The map still works, but live distances from your position are hidden.',
    };
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return {
      status: 'unavailable',
      position: null,
      accuracyMeters: null,
      message: 'Current location is unavailable. You can still move the target and test target-to-green distance.',
    };
  }

  return {
    status: 'error',
    position: null,
    accuracyMeters: null,
    message: 'Location timed out. Try again outdoors with a clear view of the sky.',
  };
}

export function useCurrentLocation(enabled = true): CurrentLocationState {
  const [state, setState] = useState<CurrentLocationState>(INITIAL_LOCATION_STATE);

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_LOCATION_STATE);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'unavailable',
        position: null,
        accuracyMeters: null,
        message: 'This browser does not support location services.',
      });
      return;
    }

    setState((prev) => ({
      ...prev,
      status: 'watching',
      message: 'Waiting for GPS location...',
    }));

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setState({
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
      (error) => {
        setState(geolocationErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return state;
}
