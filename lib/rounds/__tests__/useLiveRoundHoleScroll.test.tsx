/** @jest-environment jsdom */

import React, { useRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  LIVE_ROUND_SCROLL_TOP_OFFSET,
  scrollLiveRoundHoleIntoView,
  useLiveRoundHoleScroll,
} from '@/lib/rounds/useLiveRoundHoleScroll';

function TestHarness({
  enabled,
  expandedHole,
}: {
  enabled: boolean;
  expandedHole: number;
}) {
  const holeCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useLiveRoundHoleScroll({
    enabled,
    expandedHole,
    holeCardRefs,
  });

  return (
    <div>
      <div
        data-testid="hole-1"
        ref={(element) => {
          holeCardRefs.current[1] = element;
        }}
      />
      <div
        data-testid="hole-2"
        ref={(element) => {
          holeCardRefs.current[2] = element;
        }}
      />
    </div>
  );
}

describe('useLiveRoundHoleScroll', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const originalScrollTo = window.scrollTo;

  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 400,
      writable: true,
    });

    window.scrollTo = jest.fn();
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();
  });

  afterAll(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.scrollTo = originalScrollTo;
  });

  it('does not scroll when live round first opens on hole 1', async () => {
    render(<TestHarness enabled expandedHole={1} />);

    await waitFor(() => {
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });

  it('scrolls on initial render when resuming on a later hole', async () => {
    const getBoundingClientRectSpy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'hole-2') {
          return {
            bottom: 360,
            height: 120,
            left: 0,
            right: 320,
            toJSON: () => ({}),
            top: 240,
            width: 320,
            x: 0,
            y: 240,
          };
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          toJSON: () => ({}),
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        };
      });

    try {
      render(<TestHarness enabled expandedHole={2} />);

      await waitFor(() => {
        expect(window.scrollTo).toHaveBeenCalledWith({
          top: 400 + 240 - LIVE_ROUND_SCROLL_TOP_OFFSET,
          behavior: 'auto',
        });
      });
    } finally {
      getBoundingClientRectSpy.mockRestore();
    }
  });

  it('scrolls the newly expanded live-round hole below the fixed header offset', async () => {
    const { getByTestId, rerender } = render(<TestHarness enabled expandedHole={1} />);
    const holeTwo = getByTestId('hole-2');

    holeTwo.getBoundingClientRect = jest.fn(() => ({
      bottom: 360,
      height: 120,
      left: 0,
      right: 320,
      toJSON: () => ({}),
      top: 240,
      width: 320,
      x: 0,
      y: 240,
    }));

    (window.scrollTo as jest.Mock).mockClear();
    rerender(<TestHarness enabled expandedHole={2} />);

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 400 + 240 - LIVE_ROUND_SCROLL_TOP_OFFSET,
        behavior: 'auto',
      });
    });
  });

  it('does not scroll when live-round navigation is inactive', async () => {
    render(<TestHarness enabled={false} expandedHole={2} />);

    await waitFor(() => {
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });

  it('computes a non-negative top value for direct scroll calls', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = jest.fn(() => ({
      bottom: 40,
      height: 40,
      left: 0,
      right: 320,
      toJSON: () => ({}),
      top: -500,
      width: 320,
      x: 0,
      y: -500,
    }));

    scrollLiveRoundHoleIntoView(element, LIVE_ROUND_SCROLL_TOP_OFFSET);

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'auto',
    });
  });
});
