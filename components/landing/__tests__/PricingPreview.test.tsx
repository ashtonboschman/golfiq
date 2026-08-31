/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PricingPreview from '@/components/landing/PricingPreview';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedCaptureClientEvent = jest.mocked(captureClientEvent);

describe('landing pricing preview', () => {
  it('shows the current free and monthly Premium preview', () => {
    mockedCaptureClientEvent.mockClear();
    render(<PricingPreview />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Track Every Round Free. Premium Adds More Insight.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Free' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByText('$0', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.classList.contains('landing-plan-price') === true
        && element.textContent?.replace(/\s+/g, ' ').trim() === '$6.99 CAD per month'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Live GPS and My Bag club suggestions on supported courses/)).toBeInTheDocument();
    const startFree = screen.getByRole('link', { name: 'Start Free' });
    const viewFullPricing = screen.getByRole('link', { name: 'View Full Pricing' });
    expect(startFree).toHaveAttribute(
      'href',
      '/onboarding?source=landing-pricing',
    );
    expect(viewFullPricing).toHaveAttribute('href', '/pricing');
    fireEvent.click(startFree);
    fireEvent.click(viewFullPricing);
    expect(mockedCaptureClientEvent).toHaveBeenNthCalledWith(
      1,
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: 'start_free',
        cta_location: 'pricing_free',
        destination: '/onboarding?source=landing-pricing',
      },
      { pathname: '/' },
    );
    expect(mockedCaptureClientEvent).toHaveBeenNthCalledWith(
      2,
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: 'view_full_pricing',
        cta_location: 'pricing_premium',
        destination: '/pricing',
      },
      { pathname: '/' },
    );
  });
});
