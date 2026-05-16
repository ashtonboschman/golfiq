/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoundInsights from '@/components/RoundInsights';
import { useSession } from 'next-auth/react';

const mockPush = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/rounds/123/stats',
}));

jest.mock('@/lib/insights/insightsNudge', () => ({
  consumeRoundInsightsRefreshPending: () => false,
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

function payload(confidence: 'LOW' | 'MED' | 'HIGH') {
  return {
    messages: [
      'You shot 79 (+9), which is 2.8 strokes better than your recent average of 81.8.',
      'Approach was the biggest source of lost strokes.',
      'Next round: Play to the center of the green.',
    ],
    message_levels: ['success', 'warning', 'info'],
    confidence,
  };
}

describe('RoundInsights confidence pill UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      data: { user: { id: '1' } },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: payload('LOW') }),
    });
  });

  it('replaces Free/Premium badge and standalone confidence line with confidence pill', async () => {
    render(
      <RoundInsights
        roundId="round-low"
        isPremium={false}
        initialInsightsPayload={payload('LOW')}
      />,
    );

    await screen.findByText('Performance Insights');
    expect(screen.getByRole('button', { name: /Insight confidence: Building/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Free$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Premium$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Confidence:/i)).not.toBeInTheDocument();
  });

  it.each([
    ['LOW', 'Building', 'is-low'],
    ['MED', 'Moderate', 'is-medium'],
    ['HIGH', 'Strong', 'is-high'],
  ] as const)('renders confidence pill label/color for %s', async (confidence, label, cssClass) => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: payload(confidence) }),
    });

    render(
      <RoundInsights
        roundId={`round-${confidence}`}
        isPremium={true}
        initialInsightsPayload={payload(confidence)}
      />,
    );

    const pill = await screen.findByRole('button', { name: new RegExp(`Insight confidence: ${label}`, 'i') });
    expect(pill).toHaveClass('insights-confidence-pill');
    expect(pill).toHaveClass(cssClass);
  });

  it('renders confidence pill as an interactive button', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: payload('MED') }),
    });

    render(
      <RoundInsights
        roundId="round-tooltip"
        isPremium={false}
        initialInsightsPayload={payload('MED')}
      />,
    );

    const pill = await screen.findByRole('button', { name: /Insight confidence: Moderate/i });
    expect(pill).not.toBeDisabled();
    fireEvent.click(pill);
  });

  it('uses warning icon class when M1 level is warning', async () => {
    const warningPayload = {
      ...payload('MED'),
      messages: [
        'You shot 89 (+19), which is 8.2 strokes above your recent average of 80.8.',
        'Approach was the biggest source of lost strokes.',
        'Next round: Play to the center of the green.',
      ],
      message_levels: ['warning', 'warning', 'info'],
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: warningPayload }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-warning-icon"
        isPremium={true}
        initialInsightsPayload={warningPayload}
      />,
    );

    await screen.findByText('Performance Insights');
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons.length).toBeGreaterThanOrEqual(1);
    expect(icons[0]).toHaveClass('insight-level-warning');
  });

  it('free users see 3 insight cards and lock-overlay CTA copy after cards', async () => {
    const { container } = render(
      <RoundInsights
        roundId="round-free-cta"
        isPremium={false}
        initialInsightsPayload={payload('HIGH')}
      />,
    );

    await screen.findByText('Performance Insights');
    expect(screen.getByText('You shot 79 (+9), which is 2.8 strokes better than your recent average of 81.8.')).toBeInTheDocument();
    expect(screen.getByText('Approach was the biggest source of lost strokes.')).toBeInTheDocument();
    expect(screen.getByText('Next round: Play to the center of the green.')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: "Unlock exactly what's costing you strokes" })).toBeInTheDocument();
    expect(screen.getByText("See your biggest weakness and how many strokes it's costing per round.")).toBeInTheDocument();
    expect(screen.getByText('Your full breakdown is ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock Full Breakdown' })).toBeInTheDocument();

    expect(container.querySelector('.locked-section.round-insights-lock-section')).toBeInTheDocument();
    expect(container.querySelector('.locked-overlay.has-cta')).toBeInTheDocument();
    expect(container.querySelector('.locked-overlay-card')).toBeInTheDocument();
  });

  it('premium users do not see the free upgrade CTA', async () => {
    render(
      <RoundInsights
        roundId="round-premium-no-cta"
        isPremium={true}
        initialInsightsPayload={payload('HIGH')}
      />,
    );

    await screen.findByText('Performance Insights');
    expect(screen.queryByRole('heading', { name: "Unlock exactly what's costing you strokes" })).not.toBeInTheDocument();
    expect(screen.queryByText("See your biggest weakness and how many strokes it's costing per round.")).not.toBeInTheDocument();
    expect(screen.queryByText('Your full breakdown is ready.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Breakdown' })).not.toBeInTheDocument();
  });
});
