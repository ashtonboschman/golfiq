/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OnboardingInsightsPreview from '@/components/onboarding/previews/OnboardingInsightsPreview';

jest.mock('@/components/onboarding/previews/OnboardingPreview.module.css', () => {
  const proxy = new Proxy(
    {},
    {
      get: (_, key) => String(key),
    },
  );
  return proxy;
});

describe('OnboardingInsightsPreview', () => {
  it('previews the real Game Trends roles with specific sample evidence', () => {
    render(<OnboardingInsightsPreview />);

    expect(screen.getByRole('heading', { name: 'Game Trends' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Overall Insights' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Form' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Strength' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stability' })).toBeInTheDocument();
    expect(screen.getByText(/latest 5 rounds average 84\.2 compared with 88\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.7 strokes gained per round/i)).toBeInTheDocument();
    expect(screen.getByText(/Seven strokes separated your best and worst scores/i)).toBeInTheDocument();
  });
});
