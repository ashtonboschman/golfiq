/** @jest-environment jsdom */

import { act, render } from '@testing-library/react';
import { useLiveGpsLocation } from '@/lib/gps/useLiveGpsLocation';

const mockWatchPosition = jest.fn();
const mockClearWatch = jest.fn();

function LocationHarness({ active }: { active: boolean }) {
  useLiveGpsLocation(active);
  return null;
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
});
