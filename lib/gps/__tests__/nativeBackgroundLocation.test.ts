import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { isNativeIOS } from '@/lib/platform';
import {
  isNativeBackgroundGpsAvailable,
  startNativeBackgroundGps,
  stopNativeBackgroundGps,
} from '@/lib/gps/nativeBackgroundLocation';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isPluginAvailable: jest.fn(),
  },
}));

jest.mock('@capgo/background-geolocation', () => ({
  BackgroundGeolocation: {
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

const mockedIsNativeIOS = jest.mocked(isNativeIOS);
const mockedIsPluginAvailable = jest.mocked(Capacitor.isPluginAvailable);
const mockedStart = jest.mocked(BackgroundGeolocation.start);
const mockedStop = jest.mocked(BackgroundGeolocation.stop);

describe('native background GPS bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeIOS.mockReturnValue(true);
    mockedIsPluginAvailable.mockReturnValue(true);
    mockedStart.mockResolvedValue();
    mockedStop.mockResolvedValue();
  });

  it('only reports available for a native iOS build containing the plugin', () => {
    expect(isNativeBackgroundGpsAvailable()).toBe(true);

    mockedIsPluginAvailable.mockReturnValue(false);
    expect(isNativeBackgroundGpsAvailable()).toBe(false);

    mockedIsPluginAvailable.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(false);
    expect(isNativeBackgroundGpsAvailable()).toBe(false);
  });

  it('starts fresh, round-scoped background tracking without requesting Always access', async () => {
    const onPosition = jest.fn();
    const onError = jest.fn();

    await startNativeBackgroundGps({ onPosition, onError });

    expect(mockedStart).toHaveBeenCalledWith(
      {
        backgroundTitle: 'GolfIQ Live GPS',
        backgroundMessage: 'GolfIQ is keeping yardages ready during your active GPS round.',
        distanceFilter: 3,
        requestPermissions: false,
        stale: false,
      },
      expect.any(Function),
    );

    const callback = mockedStart.mock.calls[0][1];
    const position = { latitude: 49.9, longitude: -97.1, accuracy: 8 } as never;
    callback(position);
    expect(onPosition).toHaveBeenCalledWith(position);

    const error = { code: 'NOT_AUTHORIZED' } as never;
    callback(undefined, error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('stops the native location manager', async () => {
    await stopNativeBackgroundGps();
    expect(mockedStop).toHaveBeenCalledTimes(1);
  });
});
