'use client';

import { Capacitor } from '@capacitor/core';
import {
  BackgroundGeolocation,
  type CallbackError,
  type Location,
} from '@capgo/background-geolocation';
import { isNativeIOS } from '@/lib/platform';

export type NativeBackgroundGpsHandlers = {
  onPosition: (position: Location) => void;
  onError: (error: CallbackError) => void;
};

export function isNativeBackgroundGpsAvailable() {
  return (
    isNativeIOS()
    && Capacitor.isPluginAvailable('BackgroundGeolocation')
  );
}

export async function ensureNativeBackgroundGpsPermission() {
  const current = await BackgroundGeolocation.checkPermissions();
  if (current.location === 'granted') return true;
  if (current.location === 'denied') return false;

  const requested = await BackgroundGeolocation.requestPermissions({
    permissions: ['location', 'backgroundLocation'],
  });
  return requested.location === 'granted';
}

export function startNativeBackgroundGps({
  onPosition,
  onError,
}: NativeBackgroundGpsHandlers) {
  return BackgroundGeolocation.start(
    {
      backgroundTitle: 'GolfIQ Live GPS',
      backgroundMessage: 'GolfIQ is keeping yardages ready during your active GPS round.',
      distanceFilter: 3,
      requestPermissions: false,
      stale: false,
    },
    (position, error) => {
      if (error) {
        onError(error);
        return;
      }

      if (position) onPosition(position);
    },
  );
}

export function stopNativeBackgroundGps() {
  return BackgroundGeolocation.stop();
}
