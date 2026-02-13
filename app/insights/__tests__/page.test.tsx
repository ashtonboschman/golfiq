/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightsPage from '@/app/insights/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';

const mockPush = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
  return {
    generated_at: '2026-02-12T10:00:00.000Z',
    cards: [
      'Card 1 summary',
      'Card 2 strength',
      'Card 3 opportunity',
      'Card 4 drill',
      'Card 5 strategy',
      'Card 6 projection',
    ],
    cards_locked_count: 5,
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

describe('/insights page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({ status: 'authenticated' });
    mockedUseSubscription.mockReturnValue({ isPremium: false });
    (global as any).fetch = jest.fn();
  });

  it('renders free gating with one visible card and 4 blurred previews + CTA', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText('Overall Insights');
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Card 1 summary')).toBeInTheDocument();
    expect(screen.getByText('Unlock full Overall Insights')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock Full Insights' })).toBeInTheDocument();
    expect(container.querySelectorAll('.overall-insight-fake')).toHaveLength(4);
  });

  it('renders SG/projection sections as locked blur overlays for free with only one unlock button', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText('Overall Insights');

    expect(screen.getByText('Strokes Gained Trend (Premium)')).toBeInTheDocument();
    expect(screen.getByText('SG Component Breakdown (Premium)')).toBeInTheDocument();
    expect(screen.getByText('Performance Trajectory (Premium)')).toBeInTheDocument();
    expect(screen.getByText('SG Component Delta (Recent vs Average)')).toBeInTheDocument();

    expect(container.querySelectorAll('.locked-section')).toHaveLength(4);
    expect(container.querySelectorAll('.locked-blur-content')).toHaveLength(4);
    expect(container.querySelectorAll('.locked-overlay.has-cta')).toHaveLength(1);

    const unlockButtons = screen.getAllByRole('button', { name: /unlock full insights/i });
    expect(unlockButtons).toHaveLength(1);

    const trajectoryLockSection = screen
      .getByText('Performance Trajectory (Premium)')
      .closest('.locked-section');
    expect(trajectoryLockSection).not.toBeNull();
    expect(trajectoryLockSection?.querySelector('button.btn-upgrade')).toBeNull();
  });

  it('renders premium with all insight cards and no unlock CTA', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(true) }),
    });

    render(<InsightsPage />);

    await screen.findByText('Overall Insights');
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('Card 1 summary')).toBeInTheDocument();
    expect(screen.getByText('Card 6 projection')).toBeInTheDocument();
    expect(screen.queryByText('Unlock full Overall Insights')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();
  });

  it('shows card values with fixed 1-decimal formatting', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(true) }),
    });

    render(<InsightsPage />);

    await screen.findByText('Scoring');
    expect(screen.getByText('75.2')).toBeInTheDocument();
    expect(screen.getByText('75.7')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('49.2%')).toBeInTheDocument();
    expect(screen.getByText('33.0')).toBeInTheDocument();
    expect(screen.getByText('30.6')).toBeInTheDocument();
    expect(screen.getByText('1.3')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
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
      expect(global.fetch).toHaveBeenCalledWith('/api/insights/overall?statsMode=9', { credentials: 'include' });
    });

    await screen.findByText('39.4');
    expect(screen.getByText('41.0')).toBeInTheDocument();
  });
});
