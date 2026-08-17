/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OnboardingGpsPreview from '@/components/onboarding/previews/OnboardingGpsPreview';
import LiveGpsHoleMap from '@/components/gps/LiveGpsHoleMap';

jest.mock('@/components/onboarding/previews/OnboardingPreview.module.css', () => {
  const proxy = new Proxy(
    {},
    {
      get: (_, key) => String(key),
    },
  );
  return proxy;
});

jest.mock('@/components/gps/LiveGpsHoleMap', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="real-gps-hole-map" />),
}));

const mockedLiveGpsHoleMap = jest.mocked(LiveGpsHoleMap);

describe('OnboardingGpsPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the real GPS view with fixed MacGregor Hole 1 demo data', () => {
    render(<OnboardingGpsPreview />);

    expect(screen.getByTestId('real-gps-hole-map')).toBeInTheDocument();
    expect(screen.getByText('Hole 1')).toBeInTheDocument();
    expect(screen.getByText('Par 4 · 372 yd · HCP 3')).toBeInTheDocument();
    expect(screen.getByText('Log Score').closest('button')).toHaveAttribute('tabindex', '-1');

    expect(mockedLiveGpsHoleMap).toHaveBeenCalledWith(
      expect.objectContaining({
        par: 4,
        routeKey: 'onboarding-macgregor-hole-1',
        userPosition: { lat: 49.9729305, lng: -98.7679347 },
        userAccuracyMeters: 5,
        userLocationStatus: 'granted',
        hole: expect.objectContaining({
          holeNumber: 1,
          tee: { lat: 49.9729305, lng: -98.7679347 },
        }),
        suggestionClubs: expect.arrayContaining([
          expect.objectContaining({ shortLabel: '7I', carryYards: 185 }),
        ]),
      }),
      undefined,
    );
  });
});
