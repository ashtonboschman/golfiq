import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { isNativeIOS } from '@/lib/platform';
import {
  ensureNativeBackgroundGpsPermission,
  ensureNativeForegroundGpsPermission,
  isNativeBackgroundGpsAvailable,
  requestNativeForegroundGpsPosition,
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
    checkPermissions: jest.fn(),
    requestPermissions: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

const mockedIsNativeIOS = jest.mocked(isNativeIOS);
const mockedIsPluginAvailable = jest.mocked(Capacitor.isPluginAvailable);
const mockedCheckPermissions = jest.mocked(BackgroundGeolocation.checkPermissions);
const mockedRequestPermissions = jest.mocked(BackgroundGeolocation.requestPermissions);
const mockedStart = jest.mocked(BackgroundGeolocation.start);
const mockedStop = jest.mocked(BackgroundGeolocation.stop);

describe('native background GPS bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeIOS.mockReturnValue(true);
    mockedIsPluginAvailable.mockReturnValue(true);
    mockedCheckPermissions.mockResolvedValue({
      location: 'granted',
      backgroundLocation: 'granted',
    });
    mockedRequestPermissions.mockResolvedValue({
      location: 'granted',
      backgroundLocation: 'granted',
    });
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

  it('uses an existing native location grant without prompting again', async () => {
    await expect(ensureNativeBackgroundGpsPermission()).resolves.toBe(true);

    expect(mockedCheckPermissions).toHaveBeenCalledTimes(1);
    expect(mockedRequestPermissions).not.toHaveBeenCalled();
  });

  it('requests location access once when native authorization is undetermined', async () => {
    mockedCheckPermissions.mockResolvedValue({
      location: 'prompt',
      backgroundLocation: 'prompt',
    });
    mockedRequestPermissions.mockResolvedValue({
      location: 'granted',
      backgroundLocation: 'when_in_use',
    });

    await expect(ensureNativeBackgroundGpsPermission()).resolves.toBe(true);

    expect(mockedRequestPermissions).toHaveBeenCalledWith({
      permissions: ['location', 'backgroundLocation'],
    });
  });

  it('requests only foreground access for a one-shot native location', async () => {
    mockedCheckPermissions.mockResolvedValue({
      location: 'prompt',
      backgroundLocation: 'prompt',
    });

    await expect(ensureNativeForegroundGpsPermission()).resolves.toBe(true);

    expect(mockedRequestPermissions).toHaveBeenCalledWith({
      permissions: ['location'],
    });
  });

  it('requests the background upgrade after foreground access was already granted', async () => {
    mockedCheckPermissions.mockResolvedValue({
      location: 'granted',
      backgroundLocation: 'when_in_use',
    });

    await expect(ensureNativeBackgroundGpsPermission()).resolves.toBe(true);

    expect(mockedRequestPermissions).toHaveBeenCalledWith({
      permissions: ['backgroundLocation'],
    });
  });

  it('respects a denied native location choice without prompting repeatedly', async () => {
    mockedCheckPermissions.mockResolvedValue({
      location: 'denied',
      backgroundLocation: 'denied',
    });

    await expect(ensureNativeBackgroundGpsPermission()).resolves.toBe(false);

    expect(mockedRequestPermissions).not.toHaveBeenCalled();
  });

  it('reports denial when the native permission request is declined', async () => {
    mockedCheckPermissions.mockResolvedValue({
      location: 'prompt',
      backgroundLocation: 'prompt',
    });
    mockedRequestPermissions.mockResolvedValue({
      location: 'denied',
      backgroundLocation: 'denied',
    });

    await expect(ensureNativeBackgroundGpsPermission()).resolves.toBe(false);
  });

  it('starts fresh, round-scoped background tracking after permission preparation', async () => {
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

  it('gets a one-shot foreground fix and stops the native location manager', async () => {
    const position = { latitude: 49.9, longitude: -97.1, accuracy: 8 } as never;
    mockedStart.mockImplementationOnce(async (_options, callback) => {
      callback(position);
    });

    await expect(requestNativeForegroundGpsPosition(1000)).resolves.toBe(position);

    expect(mockedStart).toHaveBeenCalledWith(
      {
        distanceFilter: 0,
        requestPermissions: false,
        stale: true,
      },
      expect.any(Function),
    );
    expect(mockedStop).toHaveBeenCalledTimes(1);
  });

  it('stops the native location manager', async () => {
    await stopNativeBackgroundGps();
    expect(mockedStop).toHaveBeenCalledTimes(1);
  });
});
