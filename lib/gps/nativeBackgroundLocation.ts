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

export async function ensureNativeForegroundGpsPermission() {
  const current = await BackgroundGeolocation.checkPermissions();
  if (current.location === 'granted') return true;
  if (current.location === 'denied') return false;

  const requested = await BackgroundGeolocation.requestPermissions({
    permissions: ['location'],
  });
  return requested.location === 'granted';
}

export async function ensureNativeBackgroundGpsPermission() {
  const current = await BackgroundGeolocation.checkPermissions();
  if (current.location === 'denied') return false;

  const hasForegroundPermission = current.location === 'granted';
  const hasBackgroundPermission = (
    current.backgroundLocation === 'granted'
    || current.backgroundLocation === 'always'
  );
  if (hasForegroundPermission && hasBackgroundPermission) return true;

  const permissions: ('location' | 'backgroundLocation')[] = [];
  if (!hasForegroundPermission) permissions.push('location');
  if (!hasBackgroundPermission) permissions.push('backgroundLocation');

  const requested = await BackgroundGeolocation.requestPermissions({
    permissions,
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

export async function requestNativeForegroundGpsPosition(timeoutMs: number) {
  if (!isNativeBackgroundGpsAvailable()) return null;
  if (!await ensureNativeForegroundGpsPermission()) return null;

  return new Promise<Location | null>((resolve) => {
    let settled = false;
    const settle = (position: Location | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      void BackgroundGeolocation.stop()
        .catch(() => undefined)
        .finally(() => resolve(position));
    };
    const timeoutId = setTimeout(() => settle(null), timeoutMs);

    void BackgroundGeolocation.start(
      {
        distanceFilter: 0,
        requestPermissions: false,
        stale: true,
      },
      (position, error) => {
        if (error || !position) {
          settle(null);
          return;
        }
        settle(position);
      },
    ).catch(() => settle(null));
  });
}
