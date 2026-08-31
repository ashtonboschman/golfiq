/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScreenshotCarousel from '@/components/landing/ScreenshotCarousel';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedCaptureClientEvent = jest.mocked(captureClientEvent);

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe('landing screenshot carousel', () => {
  beforeEach(() => {
    mockedCaptureClientEvent.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses accurate captions and excludes the private Lifetime grant screenshot', () => {
    render(<ScreenshotCarousel />);

    expect(screen.getByRole('region', { name: 'GolfIQ product tour' })).toBeInTheDocument();
    expect(screen.getByText('Your Game at a Glance')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Show / })).toHaveLength(9);
    expect(screen.queryByText(/lifetime access/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /themes/i })).not.toBeInTheDocument();
  });

  it('updates the visible caption with carousel navigation', () => {
    jest.useFakeTimers();
    render(<ScreenshotCarousel />);

    fireEvent.click(screen.getByRole('button', { name: 'Next screenshot' }));
    expect(screen.getByText('Live GPS While You Play')).toBeInTheDocument();
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.landingCarouselNavigated,
      expect.objectContaining({
        navigation_method: 'next_button',
        direction: 'next',
        from_slide_id: 'dashboard-round-focus',
        from_slide_number: 1,
        to_slide_id: 'live-gps-hole-map',
        to_slide_number: 2,
        slide_count: 9,
      }),
      { pathname: '/' },
    );
  });

  it('captures direct indicator navigation with the destination slide', () => {
    render(<ScreenshotCarousel />);

    fireEvent.click(screen.getByRole('button', { name: 'Show Fast Hole-by-Hole Tracking' }));
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.landingCarouselNavigated,
      expect.objectContaining({
        navigation_method: 'indicator',
        direction: 'next',
        from_slide_id: 'dashboard-round-focus',
        from_slide_number: 1,
        to_slide_id: 'live-round-hole-tracking',
        to_slide_number: 3,
        slide_count: 9,
      }),
      { pathname: '/' },
    );
  });
});
