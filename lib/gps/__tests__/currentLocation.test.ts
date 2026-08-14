/** @jest-environment jsdom */

import { requestCurrentGpsFix } from '@/lib/gps/currentLocation';
import { requestNativeForegroundGpsPosition } from '@/lib/gps/nativeBackgroundLocation';
import { isNativeIOS } from '@/lib/platform';

jest.mock('@/lib/gps/nativeBackgroundLocation', () => ({
  requestNativeForegroundGpsPosition: jest.fn(),
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

const mockedIsNativeIOS = jest.mocked(isNativeIOS);
const mockedRequestNativeForegroundGpsPosition = jest.mocked(requestNativeForegroundGpsPosition);
const getCurrentPosition = jest.fn();

describe('requestCurrentGpsFix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeIOS.mockReturnValue(false);
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
  });

  it('uses browser location for the PWA', async () => {
    getCurrentPosition.mockImplementationOnce((onSuccess: PositionCallback) => {
      onSuccess({
        coords: { latitude: 49.9, longitude: -97.1, accuracy: 8 },
      } as GeolocationPosition);
    });

    await expect(requestCurrentGpsFix()).resolves.toEqual({
      position: { lat: 49.9, lng: -97.1 },
      accuracyMeters: 8,
    });
    expect(mockedRequestNativeForegroundGpsPosition).not.toHaveBeenCalled();
  });

  it('uses only native location inside the iOS shell', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedRequestNativeForegroundGpsPosition.mockResolvedValue({
      latitude: 49.91,
      longitude: -97.11,
      accuracy: 6,
    } as never);

    await expect(requestCurrentGpsFix({ timeout: 8000 })).resolves.toEqual({
      position: { lat: 49.91, lng: -97.11 },
      accuracyMeters: 6,
    });
    expect(mockedRequestNativeForegroundGpsPosition).toHaveBeenCalledWith(8000);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
