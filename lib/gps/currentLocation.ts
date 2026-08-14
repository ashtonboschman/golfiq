'use client';

import type { LiveGpsPoint } from '@/lib/gps/liveMappingTypes';
import { requestNativeForegroundGpsPosition } from '@/lib/gps/nativeBackgroundLocation';
import { isNativeIOS } from '@/lib/platform';

export type CurrentGpsFix = {
  position: LiveGpsPoint;
  accuracyMeters: number | null;
};

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 12000,
};

export async function requestCurrentGpsFix(
  options: PositionOptions = DEFAULT_OPTIONS,
): Promise<CurrentGpsFix | null> {
  if (isNativeIOS()) {
    const nativePosition = await requestNativeForegroundGpsPosition(options.timeout ?? 12000);
    if (!nativePosition) return null;

    return {
      position: {
        lat: nativePosition.latitude,
        lng: nativePosition.longitude,
      },
      accuracyMeters: Number.isFinite(nativePosition.accuracy)
        ? nativePosition.accuracy
        : null,
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      () => resolve(null),
      options,
    );
  });
}
