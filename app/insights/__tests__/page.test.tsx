/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightsPage from '@/app/insights/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/insights',
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange }: any) => (
    <select
      data-testid="stats-mode-select"
      value={value?.value ?? ''}
      onChange={(e) => {
        const next = options.find((opt: any) => opt.value === e.target.value);
        onChange?.(next);
      }}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/TrendCard', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid={`trend-${label}`}>{label}</div>,
}));

jest.mock('@/components/InfoTooltip', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span data-testid="info-tooltip">{text}</span>,
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

type StatsMode = 'combined' | '9' | '18';

function makeModePayload(overrides?: Partial<any>) {
  return {
    kpis: {
      roundsRecent: 5,
      avgScoreRecent: 75.2,
      avgScoreBaseline: 75.7,
      avgToParRecent: 3.2,
      avgSgTotalRecent: 0.2,
      bestScoreRecent: 72,
      deltaVsBaseline: -0.5,
    },
    consistency: {
      label: 'stable',
      stdDev: 2.0,
    },
    efficiency: {
      fir: { recent: 0.5, baseline: 0.492, coverageRecent: '5/5' },
      gir: { recent: 0.481, baseline: 0.468, coverageRecent: '5/5' },
      puttsTotal: { recent: 33.0, baseline: 30.6, coverageRecent: '5/5' },
      penaltiesPerRound: { recent: 1.3, baseline: 1.5, coverageRecent: '5/5' },
    },
    sgComponents: {
      recentAvg: { total: -0.5, offTee: 0.2, approach: -0.8, putting: -0.6, penalties: 0.1, residual: 0.1 },
      baselineAvg: { total: 0, offTee: 0, approach: 0, putting: 0, penalties: 0, residual: 0 },
      hasData: true,
    },
    trend: {
      labels: ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5'],
      score: [76, 75, 74, 75, 76],
      firPct: [50, 49, 48, 50, 51],
      girPct: [48, 47, 46, 49, 50],
      sgTotal: [-0.4, -0.2, -0.1, -0.3, -0.5],
      handicap: [3.4, 3.3, 3.2, 3.1, 3.0],
    },
    ...overrides,
  };
}

function makeInsights(isPremium: boolean, modeOverrides?: Partial<Record<StatsMode, Partial<any>>>) {
  const card2 = isPremium
    ? "Approach is costing you strokes. You're losing about 0.8 strokes per round compared to your usual level."
    : 'Approach is costing you strokes. This has been the biggest difference in your recent rounds. The full breakdown shows exactly how much.';
  return {
    generated_at: '2026-02-12T10:00:00.000Z',
    cards: [
      'Your recent rounds are close to your usual level. Your scoring is staying in its normal range.',
      card2,
      'Your scoring has some movement. Your scores are moving around, but not wildly from round to round.',
    ],
    cards_locked_count: 0,
    projection: {
      trajectory: 'improving',
      projectedScoreIn10: 73,
      handicapCurrent: 3.4,
      projectedHandicapIn10: 3.0,
    },
    projection_ranges: {
      scoreLow: 72,
      scoreHigh: 75,
      handicapLow: 2.8,
      handicapHigh: 4.6,
    },
    projection_by_mode: {
      combined: {
        trajectory: 'improving',
        projectedScoreIn10: 73,
        scoreLow: 72,
        scoreHigh: 75,
        roundsUsed: 20,
      },
      '9': {
        trajectory: 'improving',
        projectedScoreIn10: 39.4,
        scoreLow: 38.1,
        scoreHigh: 40.9,
        roundsUsed: 14,
      },
      '18': {
        trajectory: 'flat',
        projectedScoreIn10: 76.2,
        scoreLow: 74.9,
        scoreHigh: 77.8,
        roundsUsed: 12,
      },
    },
    tier_context: {
      isPremium,
      baseline: isPremium ? 'alltime' : 'last20',
      maxRoundsUsed: 20,
      recentWindow: 5,
    },
    consistency: {
      label: 'stable',
      stdDev: 2.0,
    },
    efficiency: {
      fir: { recent: 0.5, baseline: 0.492, coverageRecent: '5/5' },
      gir: { recent: 0.481, baseline: 0.468, coverageRecent: '5/5' },
      puttsTotal: { recent: 33.0, baseline: 30.6, coverageRecent: '5/5' },
      penaltiesPerRound: { recent: 1.3, baseline: 1.5, coverageRecent: '5/5' },
    },
    sg_locked: !isPremium,
    sg: {
      trend: {
        labels: ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5'],
        sgTotal: [-0.4, -0.2, -0.1, -0.3, -0.5],
      },
      components: {
        latest: {
          total: -0.5,
          offTee: 0.2,
          approach: -0.8,
          putting: -0.6,
          penalties: 0.1,
          residual: 0.1,
          confidence: 'medium',
          partialAnalysis: false,
        },
        recentAvg: { total: -0.5, offTee: 0.2, approach: -0.8, putting: -0.6, penalties: 0.1, residual: 0.1 },
        baselineAvg: { total: 0, offTee: 0, approach: 0, putting: 0, penalties: 0, residual: 0 },
        mostCostlyComponent: 'approach',
        worstComponentFrequencyRecent: {
          component: 'approach',
          count: 3,
          window: 5,
        },
        hasData: true,
      },
    },
    mode_payload: {
      combined: makeModePayload(modeOverrides?.combined),
      '9': makeModePayload({
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 39.4,
          avgScoreBaseline: 41.0,
          avgToParRecent: 3.0,
          avgSgTotalRecent: 0.1,
          bestScoreRecent: 37,
          deltaVsBaseline: -1.6,
        },
        ...modeOverrides?.['9'],
      }),
      '18': makeModePayload({
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 76.2,
          avgScoreBaseline: 76.3,
          avgToParRecent: 4.0,
          avgSgTotalRecent: 0.0,
          bestScoreRecent: 73,
          deltaVsBaseline: -0.1,
        },
        ...modeOverrides?.['18'],
      }),
    },
    handicap_trend: {
      labels: ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5'],
      handicap: [3.4, 3.3, 3.2, 3.1, 3.0],
    },
  };
}

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseSubscription = useSubscription as unknown as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as unknown as jest.Mock;

describe('/insights page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({ status: 'authenticated' });
    mockedUseSubscription.mockReturnValue({ isPremium: false });
    (global as any).fetch = jest.fn();
  });

  it('renders all 3 overall insight cards for free with no lock overlay CTA', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText('Your recent rounds are close to your usual level. Your scoring is staying in its normal range.');
    expect(screen.getByRole('button', { name: 'Overall insights confidence: High' })).toBeInTheDocument();
    expect(container.querySelector('.insights-badge')).toBeNull();
    expect(screen.queryByRole('button', { name: /Regenerate/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Overall Insights compares your recent rounds (up to 5) against your overall average to detect form trends.')).not.toBeInTheDocument();
    expect(screen.queryByText('Overall Insights compares your recent rounds (up to 5) against your last 20 rounds to detect form trends.')).not.toBeInTheDocument();
    expect(screen.getByText('Approach is costing you strokes. This has been the biggest difference in your recent rounds. The full breakdown shows exactly how much.')).toBeInTheDocument();
    expect(screen.getByText('Your scoring has some movement. Your scores are moving around, but not wildly from round to round.')).toBeInTheDocument();
    expect(screen.queryByText('Unlock full Overall Insights')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.overall-insight-fake')).toHaveLength(0);
  });

  it('renders SG sections locked for free and only SG trend lock has pricing CTA', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText("See exactly what's costing you strokes");

    expect(screen.getByText("See exactly what's costing you strokes")).toBeInTheDocument();
    expect(screen.getByText("Break down your game and see how many strokes each part is adding or losing per round.")).toBeInTheDocument();
    expect(screen.getByText('SG Component Breakdown (Premium)')).toBeInTheDocument();
    expect(screen.getByText('Performance Trajectory')).toBeInTheDocument();
    expect(screen.getByText('Score Range')).toBeInTheDocument();
    expect(screen.getByText('Handicap Range')).toBeInTheDocument();
    expect(
      screen.getByText('Upgrade to unlock projected score and handicap ranges.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Performance Trajectory (Premium)')).not.toBeInTheDocument();
    expect(screen.getByText('SG Component Delta')).toBeInTheDocument();

    expect(container.querySelectorAll('.locked-section')).toHaveLength(2);
    expect(container.querySelectorAll('.locked-blur-content')).toHaveLength(2);
    expect(container.querySelectorAll('.locked-overlay.has-cta')).toHaveLength(1);
    expect(container.querySelector('.trajectory-lock-section')).toBeNull();

    const ctaButtons = screen.getAllByRole('button', { name: 'Unlock Premium Insights' });
    expect(ctaButtons).toHaveLength(1);
  });

  it('renders premium with all 3 insight cards and no unlock CTA', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(true) }),
    });

    render(<InsightsPage />);

    await screen.findByText('Your scoring has some movement. Your scores are moving around, but not wildly from round to round.');
    expect(screen.getByRole('button', { name: 'Overall insights confidence: High' })).toBeInTheDocument();
    expect(screen.getByText('Your recent rounds are close to your usual level. Your scoring is staying in its normal range.')).toBeInTheDocument();
    expect(screen.getByText("Approach is costing you strokes. You're losing about 0.8 strokes per round compared to your usual level.")).toBeInTheDocument();
    expect(screen.queryByText(/The full breakdown shows exactly how much\./i)).not.toBeInTheDocument();
    expect(screen.queryByText('Unlock full Overall Insights')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Premium Insights' })).not.toBeInTheDocument();
  });

  it('shows Overall Insights confidence tooltip copy', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    render(<InsightsPage />);

    const confidencePill = await screen.findByRole('button', { name: 'Overall insights confidence: High' });
    fireEvent.click(confidencePill);
    expect(screen.getByText('Insight Confidence')).toBeInTheDocument();
    expect(
      screen.getByText(
        "This shows how much data GolfIQ has behind your Overall Insights. Low means early trends. Medium means some patterns are available. High means stronger data and clearer patterns.",
      ),
    ).toBeInTheDocument();
  });

  it('derives Low/Medium/High confidence pill labels and tone classes', async () => {
    const lowInsights = makeInsights(false, {
      combined: {
        kpis: { roundsRecent: 1, avgScoreRecent: null, avgScoreBaseline: null, avgToParRecent: null, avgSgTotalRecent: null, bestScoreRecent: null, deltaVsBaseline: null },
        consistency: { label: 'insufficient', stdDev: null },
      },
    });
    const mediumInsights = makeInsights(false, {
      combined: {
        kpis: { roundsRecent: 3, avgScoreRecent: 84, avgScoreBaseline: 84.5, avgToParRecent: 12, avgSgTotalRecent: null, bestScoreRecent: 82, deltaVsBaseline: -0.5 },
        consistency: { label: 'moderate', stdDev: 2.1 },
      },
    });
    const highInsights = makeInsights(false, {
      combined: {
        kpis: { roundsRecent: 6, avgScoreRecent: 79, avgScoreBaseline: 82, avgToParRecent: 7, avgSgTotalRecent: null, bestScoreRecent: 77, deltaVsBaseline: -3 },
        consistency: { label: 'stable', stdDev: 1.4 },
      },
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: lowInsights }),
    });
    const lowRender = render(<InsightsPage />);
    const lowPill = await screen.findByRole('button', { name: 'Overall insights confidence: Low' });
    expect(lowPill).toHaveClass('is-low');
    lowRender.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: mediumInsights }),
    });
    const mediumRender = render(<InsightsPage />);
    const mediumPill = await screen.findByRole('button', { name: 'Overall insights confidence: Medium' });
    expect(mediumPill).toHaveClass('is-medium');
    mediumRender.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: highInsights }),
    });
    render(<InsightsPage />);
    const highPill = await screen.findByRole('button', { name: 'Overall insights confidence: High' });
    expect(highPill).toHaveClass('is-high');
  });

  it('uses backend confidence value when provided', async () => {
    const insights = makeInsights(false);
    (insights as any).confidence = 'low';
    insights.mode_payload.combined.kpis.roundsRecent = 6;
    insights.mode_payload.combined.consistency = { label: 'stable', stdDev: 1.2 };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    const pill = await screen.findByRole('button', { name: 'Overall insights confidence: Low' });
    expect(pill).toHaveClass('is-low');
  });

  it('sends insights_viewed analytics with rounds_recent payload key', async () => {
    const insights = makeInsights(false);
    insights.generated_at = '2026-02-12T10:00:01.000Z';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);
    await screen.findByText('Your recent rounds are close to your usual level. Your scoring is staying in its normal range.');

    const viewedCalls = mockedCaptureClientEvent.mock.calls.filter(
      (call) => call[0] === ANALYTICS_EVENTS.insightsViewed,
    );
    expect(viewedCalls.length).toBeGreaterThan(0);
    expect(viewedCalls[0][1]).toEqual(
      expect.objectContaining({
        rounds_recent: 5,
        insight_mode: 'combined',
      }),
    );
    expect(viewedCalls[0][1]).not.toHaveProperty('rounds_lifetime');
  });

  it('routes free SG trend lock CTA to /pricing and fires upgrade analytics payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    render(<InsightsPage />);

    const button = await screen.findByRole('button', { name: 'Unlock Premium Insights' });
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledWith('/pricing');
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      expect.objectContaining({
        cta_location: 'insights_sg_trend_lock',
        source_page: 'insights',
      }),
      expect.any(Object),
    );
  });

  it('uses backend trajectory when projection_by_mode trajectory exists', async () => {
    const insights = makeInsights(true, {
      combined: {
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 70,
          avgScoreBaseline: 80,
          avgToParRecent: -2,
          avgSgTotalRecent: 0.2,
          bestScoreRecent: 69,
          deltaVsBaseline: -10,
        },
      },
    });
    insights.projection_by_mode.combined.trajectory = 'flat';

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    await screen.findByText('Flat');
    expect(screen.getByText('Flat')).toBeInTheDocument();
  });

  it('falls back to frontend trajectory classification when backend trajectory is missing', async () => {
    const insights = makeInsights(true, {
      combined: {
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 70,
          avgScoreBaseline: 80,
          avgToParRecent: -2,
          avgSgTotalRecent: 0.2,
          bestScoreRecent: 69,
          deltaVsBaseline: -10,
        },
      },
    });
    insights.projection_by_mode.combined.trajectory = undefined as any;

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    await screen.findByText('Improving');
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });

  it('updates mode-specific sections after dropdown change', async () => {
    const combinedInsights = makeInsights(true);
    const nineInsights = makeInsights(true, {
      '9': {
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 39.4,
          avgScoreBaseline: 41.0,
          avgToParRecent: 3.0,
          avgSgTotalRecent: 0.1,
          bestScoreRecent: 37,
          deltaVsBaseline: -1.6,
        },
      },
    });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ insights: combinedInsights }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ insights: nineInsights }),
      });

    render(<InsightsPage />);

    await screen.findByText('75.2');

    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '9' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/insights/overall?statsMode=9',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    await screen.findByText('39.4');
    expect(screen.getByText('41.0')).toBeInTheDocument();
  });

  it('does not show mode-switch error state when stale insights request fails after switching mode', async () => {
    const nineInsights = makeInsights(true, {
      '9': {
        kpis: {
          roundsRecent: 5,
          avgScoreRecent: 39.4,
          avgScoreBaseline: 41.0,
          avgToParRecent: 3.0,
          avgSgTotalRecent: 0.1,
          bestScoreRecent: 37,
          deltaVsBaseline: -1.6,
        },
      },
    });

    let rejectCombinedRequest: ((reason?: unknown) => void) | null = null;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('statsMode=combined')) {
        return new Promise((_, reject) => {
          rejectCombinedRequest = reject;
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ insights: nineInsights }),
      });
    });

    render(<InsightsPage />);

    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '9' } });

    await screen.findByText('39.4');

    rejectCombinedRequest?.(new Error('stale insights fetch failed'));

    await waitFor(() => {
      expect(screen.queryByText('stale insights fetch failed')).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load insights')).not.toBeInTheDocument();
    });
  });

  it('still shows error state when active insights mode request fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ insights: makeInsights(true) }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Insights mode load failed' }),
      });

    render(<InsightsPage />);

    await screen.findByText('75.2');

    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '9' } });

    await screen.findByText('Insights mode load failed');
  });
});
