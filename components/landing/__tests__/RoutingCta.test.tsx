/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Hero from '@/components/landing/Hero';
import LandingHeader from '@/components/landing/LandingHeader';
import InsightsCTA from '@/components/landing/InsightsCTA';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedCaptureClientEvent = jest.mocked(captureClientEvent);

jest.mock('@/components/landing/ScreenshotCarousel', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-carousel">carousel</div>,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => <span data-testid="mock-next-image" />,
}));

describe('landing CTAs', () => {
  beforeEach(() => {
    mockedCaptureClientEvent.mockClear();
  });

  it('routes the primary CTA to onboarding and exposes public pricing', () => {
    render(<Hero />);

    expect(
      screen.getByRole('heading', {
        name: 'Track Your Round. Understand What Shaped Your Score.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Log rounds quickly, use live GPS and club suggestions on supported courses, then see the stats and insights behind your score.',
      ),
    ).toBeInTheDocument();
    const startFree = screen.getByRole('link', { name: 'Start Free' });
    expect(startFree).toHaveAttribute('href', '/onboarding?source=landing');
    expect(screen.getByRole('link', { name: 'View Pricing' })).toHaveAttribute('href', '/pricing');
    fireEvent.click(startFree);
    fireEvent.click(screen.getByRole('link', { name: 'View Pricing' }));
    expect(mockedCaptureClientEvent).toHaveBeenNthCalledWith(
      1,
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: 'start_free',
        cta_location: 'hero',
        destination: '/onboarding?source=landing',
      },
      { pathname: '/' },
    );
    expect(mockedCaptureClientEvent).toHaveBeenNthCalledWith(
      2,
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: 'view_pricing',
        cta_location: 'hero',
        destination: '/pricing',
      },
      { pathname: '/' },
    );
    expect(screen.queryByRole('button', { name: /learn more/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See How It Works' })).not.toBeInTheDocument();
  });

  it('keeps header Login CTA pointed to /login', () => {
    render(<LandingHeader />);

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    fireEvent.click(screen.getByRole('link', { name: 'Login' }));
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: 'login',
        cta_location: 'header',
        destination: '/login',
      },
      { pathname: '/' },
    );
  });

  it('routes high-intent landing CTA in Insights section to onboarding', () => {
    render(<InsightsCTA />);

    expect(screen.getByRole('heading', { level: 2, name: /See What Cost You Strokes/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Round Insights' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Game Trends' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Round Focus' })).toBeInTheDocument();
    const startFree = screen.getByRole('link', { name: 'Start Free' });
    expect(startFree).toHaveAttribute('href', '/onboarding?source=landing');
    fireEvent.click(startFree);
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.landingCtaClicked,
      {
        cta_name: 'start_free',
        cta_location: 'insights',
        destination: '/onboarding?source=landing',
      },
      { pathname: '/' },
    );
  });
});
