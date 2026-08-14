import { requestCurrentGpsFix, type CurrentGpsFix } from '@/lib/gps/currentLocation';
import { isNativeIOS } from '@/lib/platform';

export type EphemeralGpsFix = CurrentGpsFix;

export function requestLiveRoundGpsPermission(): Promise<EphemeralGpsFix | null> {
  // The native shell owns location permission and fixes. Calling the browser
  // API inside its web view creates a second, website-branded permission prompt.
  if (isNativeIOS()) {
    return Promise.resolve(null);
  }

  return requestCurrentGpsFix();
}
