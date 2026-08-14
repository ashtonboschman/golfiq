import type { LiveGpsPoint } from '@/lib/gps/liveMappingTypes';
import { isNativeIOS } from '@/lib/platform';

export type EphemeralGpsFix = {
  position: LiveGpsPoint;
  accuracyMeters: number | null;
};

export function requestLiveRoundGpsPermission(): Promise<EphemeralGpsFix | null> {
  // The native shell owns location permission and fixes. Calling the browser
  // API inside its web view creates a second, website-branded permission prompt.
  if (isNativeIOS()) {
    return Promise.resolve(null);
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

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
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );
  });
}
