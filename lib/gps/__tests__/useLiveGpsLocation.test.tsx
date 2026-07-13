/** @jest-environment jsdom */

import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useLiveGpsLocation } from '@/lib/gps/useLiveGpsLocation';
import { MAX_USABLE_LIVE_GPS_ACCURACY_YARDS } from '@/lib/gps/liveRoute';

const mockWatchPosition = jest.fn();
const mockClearWatch = jest.fn();

function LocationHarness({ active }: { active: boolean }) {
  const { location } = useLiveGpsLocation(active);
  return (
    <div
      data-testid="location"
      data-status={location.status}
      data-lat={location.position?.lat ?? ''}
      data-lng={location.position?.lng ?? ''}
      data-accuracy={location.accuracyMeters ?? ''}
      data-timestamp={location.timestamp ?? ''}
    />
  );
}

describe('useLiveGpsLocation visibility lifecycle', () => {
  let documentHidden = false;
  let nextWatchId = 1;
  let originalHiddenDescriptor: PropertyDescriptor | undefined;
  let originalGeolocationDescriptor: PropertyDescriptor | undefined;

  beforeAll(() => {
    originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    documentHidden = false;
    nextWatchId = 1;
    mockWatchPosition.mockImplementation(() => nextWatchId++);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => documentHidden,
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
    });
  });

  afterAll(() => {
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
    if (originalGeolocationDescriptor) {
      Object.defineProperty(navigator, 'geolocation', originalGeolocationDescriptor);
    }
  });

  function setDocumentHidden(hidden: boolean) {
    documentHidden = hidden;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  function emitPosition(
    callIndex: number,
    {
      latitude = 49.9,
      longitude = -97.1,
      accuracy = 8,
      timestamp,
    }: {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      timestamp?: number;
    } = {},
  ) {
    const handlePosition = mockWatchPosition.mock.calls[callIndex][0] as PositionCallback;
    act(() => {
      handlePosition({
        coords: { latitude, longitude, accuracy },
        timestamp,
      } as GeolocationPosition);
    });
  }

  function emitError(callIndex: number, code = 2) {
    const handleError = mockWatchPosition.mock.calls[callIndex][1] as PositionErrorCallback;
    act(() => {
      handleError({ code } as GeolocationPositionError);
    });
  }

  function thresholdAccuracyMeters(deltaYards = 0) {
    return (MAX_USABLE_LIVE_GPS_ACCURACY_YARDS + deltaYards) / 1.0936132983;
  }

  it('starts one watcher when enabled and visible', () => {
    render(<LocationHarness active />);

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockWatchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );
  });

  it('stops when hidden and restarts when visible while enabled', () => {
    render(<LocationHarness active />);

    setDocumentHidden(true);
    expect(mockClearWatch).toHaveBeenCalledWith(1);

    setDocumentHidden(false);
    expect(mockWatchPosition).toHaveBeenCalledTimes(2);
  });

  it('does not start while initially hidden until the document becomes visible', () => {
    documentHidden = true;
    render(<LocationHarness active />);

    expect(mockWatchPosition).not.toHaveBeenCalled();

    setDocumentHidden(false);
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });

  it('does not restart after the hook is disabled', () => {
    const { rerender } = render(<LocationHarness active />);

    setDocumentHidden(true);
    rerender(<LocationHarness active={false} />);
    setDocumentHidden(false);

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });

  it('does not create duplicate watchers across repeated visibility events', () => {
    render(<LocationHarness active />);

    setDocumentHidden(true);
    setDocumentHidden(true);
    expect(mockClearWatch).toHaveBeenCalledTimes(1);

    setDocumentHidden(false);
    setDocumentHidden(false);
    expect(mockWatchPosition).toHaveBeenCalledTimes(2);
  });

  it('clears the watcher and removes the visibility listener on unmount', () => {
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const { unmount } = render(<LocationHarness active />);
    const visibilityListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'visibilitychange',
    )?.[1];

    unmount();

    expect(mockClearWatch).toHaveBeenCalledWith(1);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', visibilityListener);
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('never starts a watcher while disabled', () => {
    render(<LocationHarness active={false} />);

    setDocumentHidden(true);
    setDocumentHidden(false);
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it('uses no trusted position before the first acceptable device fix', () => {
    render(<LocationHarness active />);

    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'watching');
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '');
  });

  it('accepts the first finite in-range fix at the accuracy threshold', () => {
    render(<LocationHarness active />);

    emitPosition(0, {
      latitude: 49.901,
      longitude: -97.101,
      accuracy: thresholdAccuracyMeters(),
      timestamp: 1000,
    });

    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'granted');
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');
    expect(screen.getByTestId('location')).toHaveAttribute('data-timestamp', '1000');
  });

  it('rejects poor, missing, and invalid fixes before any accepted fix', () => {
    render(<LocationHarness active />);

    emitPosition(0, { accuracy: thresholdAccuracyMeters(1), timestamp: 1000 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '');

    emitPosition(0, { accuracy: Number.NaN, timestamp: 1001 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '');

    emitPosition(0, { latitude: 120, longitude: -97.1, accuracy: 8, timestamp: 1002 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '');
  });

  it('retains the accepted fix after poor, missing-accuracy, and error callbacks', () => {
    render(<LocationHarness active />);

    emitPosition(0, { latitude: 49.901, longitude: -97.101, accuracy: 8, timestamp: 1000 });
    emitPosition(0, { latitude: 49.902, longitude: -97.102, accuracy: thresholdAccuracyMeters(1), timestamp: 1001 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'stale');
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    emitPosition(0, { latitude: 49.903, longitude: -97.103, accuracy: Number.NaN, timestamp: 1002 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    emitError(0, 3);
    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'stale');
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');
  });

  it('keeps the tee fallback state when an error happens before any accepted fix', () => {
    render(<LocationHarness active />);

    emitError(0, 1);

    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'denied');
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '');
  });

  it('rejects older and equal timestamps while accepting deterministic missing timestamps', () => {
    render(<LocationHarness active />);

    emitPosition(0, { latitude: 49.901, longitude: -97.101, accuracy: 8, timestamp: 1000 });
    emitPosition(0, { latitude: 49.902, longitude: -97.102, accuracy: 8, timestamp: 999 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    emitPosition(0, { latitude: 49.903, longitude: -97.103, accuracy: 8, timestamp: 1000 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    emitPosition(0, { latitude: 49.904, longitude: -97.104, accuracy: 8 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.904');
    expect(Number(screen.getByTestId('location').getAttribute('data-timestamp'))).toBeGreaterThan(1000);
  });

  it('retains the accepted fix while hidden and exposes it immediately when visible', () => {
    render(<LocationHarness active />);
    emitPosition(0, { latitude: 49.901, longitude: -97.101, accuracy: 8, timestamp: 1000 });

    setDocumentHidden(true);
    expect(screen.getByTestId('location')).toHaveAttribute('data-status', 'stale');
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    setDocumentHidden(false);
    expect(mockWatchPosition).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');
  });

  it('ignores success and error callbacks from superseded watcher generations', () => {
    render(<LocationHarness active />);
    emitPosition(0, { latitude: 49.901, longitude: -97.101, accuracy: 8, timestamp: 1000 });

    setDocumentHidden(true);
    setDocumentHidden(false);

    emitPosition(0, { latitude: 49.902, longitude: -97.102, accuracy: 8, timestamp: 1001 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    emitError(0, 2);
    expect(mockClearWatch).not.toHaveBeenCalledWith(2);
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.901');

    emitPosition(1, { latitude: 49.903, longitude: -97.103, accuracy: 8, timestamp: 1002 });
    expect(screen.getByTestId('location')).toHaveAttribute('data-lat', '49.903');
  });
});
