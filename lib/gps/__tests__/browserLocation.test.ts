/** @jest-environment jsdom */

import { requestLiveRoundGpsPermission } from '@/lib/gps/browserLocation';

describe('requestLiveRoundGpsPermission', () => {
  const getCurrentPosition = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
  });

  it('requests a high-accuracy ephemeral fix', async () => {
    getCurrentPosition.mockImplementationOnce((onSuccess: PositionCallback) => {
      onSuccess({
        coords: { latitude: 49.9, longitude: -97.1, accuracy: 8 },
      } as GeolocationPosition);
    });

    await expect(requestLiveRoundGpsPermission()).resolves.toEqual({
      position: { lat: 49.9, lng: -97.1 },
      accuracyMeters: 8,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );
  });

  it('allows tee fallback when permission is denied', async () => {
    getCurrentPosition.mockImplementationOnce((
      _onSuccess: PositionCallback,
      onError: PositionErrorCallback,
    ) => {
      onError({ code: 1 } as GeolocationPositionError);
    });

    await expect(requestLiveRoundGpsPermission()).resolves.toBeNull();
  });
});
