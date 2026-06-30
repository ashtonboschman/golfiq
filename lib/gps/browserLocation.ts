import type { LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

export type EphemeralGpsFix = {
  position: LiveGpsPoint;
  accuracyMeters: number | null;
};

export function requestLiveRoundGpsPermission(): Promise<EphemeralGpsFix | null> {
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
