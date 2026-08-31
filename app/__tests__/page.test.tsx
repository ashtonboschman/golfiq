/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingPage, { metadata } from '@/app/page';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

jest.mock('@/lib/auth-config', () => ({
  authOptions: {},
}));

jest.mock('@/components/landing/LandingHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-header">Landing Header</div>,
}));

jest.mock('@/components/landing/Hero', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-hero">Hero</div>,
}));

jest.mock('@/components/landing/Features', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-features">Features</div>,
}));

jest.mock('@/components/landing/InsightsCTA', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-insights-cta">Insights CTA</div>,
}));

jest.mock('@/components/landing/PricingPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-pricing-preview">Pricing Preview</div>,
}));

jest.mock('@/components/landing/LandingFooter', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-footer">Footer</div>,
}));

jest.mock('@/components/NativeRootEntryGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedRedirect = redirect as unknown as jest.Mock;

describe('/ root landing route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the landing page for unauthenticated web visits', async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const page = await LandingPage();
    const { container } = render(page);

    expect(screen.getByTestId('landing-header')).toBeInTheDocument();
    expect(screen.getByTestId('landing-hero')).toBeInTheDocument();
    expect(screen.getByTestId('landing-features')).toBeInTheDocument();
    expect(screen.getByTestId('landing-insights-cta')).toBeInTheDocument();
    expect(screen.getByTestId('landing-pricing-preview')).toBeInTheDocument();
    expect(screen.getByTestId('landing-footer')).toBeInTheDocument();
    expect(mockedRedirect).not.toHaveBeenCalled();

    const structuredData = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((script) => JSON.parse(script.textContent || '{}'));
    const application = structuredData.find((entry) => entry['@type'] === 'SoftwareApplication');

    expect(application.operatingSystem).toBe('Web, iOS');
    expect(application.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'GolfIQ Free', price: '0', priceCurrency: 'CAD' }),
      expect.objectContaining({ name: 'GolfIQ Premium Monthly', price: '6.99', priceCurrency: 'CAD' }),
      expect.objectContaining({ name: 'GolfIQ Premium Annual', price: '49.99', priceCurrency: 'CAD' }),
    ]));
  });

  it('uses accurate public metadata for GPS, club suggestions, and insights', () => {
    expect(metadata.title).toBe('GolfIQ | Golf GPS, Round Tracking & Insights');
    expect(metadata.description).toMatch(/live GPS/);
    expect(metadata.description).toMatch(/My Bag club suggestions/);
  });

  it('redirects authenticated users to /dashboard', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: '1' },
    });

    await expect(LandingPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockedRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
