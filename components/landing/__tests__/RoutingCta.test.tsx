/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Hero from '@/components/landing/Hero';
import LandingHeader from '@/components/landing/LandingHeader';
import InsightsCTA from '@/components/landing/InsightsCTA';

jest.mock('@/components/landing/ScreenshotCarousel', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-carousel">carousel</div>,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => <span data-testid="mock-next-image" />,
}));

describe('landing CTAs', () => {
  it('uses Get Started CTA to onboarding and demotes old secondary CTA text', () => {
    render(<Hero />);

    expect(
      screen.getByRole('heading', {
        name: 'Track your rounds. Understand what shaped them.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your scorecard tells you what you shot. GolfIQ helps explain why.',
      ),
    ).toBeInTheDocument();
    const getStarted = screen.getByRole('link', { name: 'Get Started' });
    expect(getStarted).toHaveAttribute('href', '/onboarding?source=landing');
    expect(screen.queryByRole('button', { name: /learn more/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See How It Works' })).not.toBeInTheDocument();
  });

  it('keeps header Login CTA pointed to /login', () => {
    render(<LandingHeader />);

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  });

  it('routes high-intent landing CTA in Insights section to onboarding', () => {
    render(<InsightsCTA />);

    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/onboarding?source=landing');
  });
});
