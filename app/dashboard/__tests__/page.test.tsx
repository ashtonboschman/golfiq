/** @jest-environment jsdom */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '@/app/dashboard/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();
const mockUpgradeModal = jest.fn();
const mockInfoTooltip = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard',
  useSearchParams: () => ({
    get: () => null,
  }),
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, inputId }: any) => (
    <select
      aria-label={inputId}
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

jest.mock('react-chartjs-2', () => ({
  __esModule: true,
  Doughnut: () => <div data-testid="scoring-profile-doughnut">scoring-profile-doughnut</div>,
}));

jest.mock('@/components/TrendCard', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid={`trend-${label}`}>{label}</div>,
}));

jest.mock('@/components/MissTendenciesChart', () => ({
  __esModule: true,
  default: () => <div data-testid="miss-tendencies-chart">miss-tendencies</div>,
}));

jest.mock('@/components/RoundCard', () => ({
  __esModule: true,
  default: ({ round }: { round: any }) => <div>{round.course_name}</div>,
}));

jest.mock('@/components/UpgradeModal', () => ({
  __esModule: true,
  default: (props: any) => {
    mockUpgradeModal(props);
    return null;
  },
}));

jest.mock('@/components/InfoTooltip', () => ({
  __esModule: true,
  default: (props: any) => {
    mockInfoTooltip(props);
    return <span data-testid="info-tooltip" />;
  },
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseSubscription = useSubscription as unknown as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;

function makeDashboardPayload(overrides: Partial<any> = {}) {
  return {
    handicap: 8.1,
    handicap_message: null,
    total_rounds: 8,
    best_score: 74,
    worst_score: 86,
    average_score: 79.4,
    best_to_par: 2,
    worst_to_par: 14,
    average_to_par: 7.1,
    all_rounds: [
      {
        id: 101,
        date: '2026-02-22T00:00:00.000Z',
        score: 79,
        to_par: 7,
        fir_hit: 7,
        gir_hit: 8,
        putts: 32,
        penalties: 1,
        fir_total: 14,
        gir_total: 18,
        course: { course_name: 'Pebble Beach', club_name: 'Pebble', city: 'Monterey', state: 'CA' },
        tee: { tee_id: 1, tee_name: 'Blue' },
      },
    ],
    fir_avg: 52,
    gir_avg: 49,
    avg_putts: 32.1,
    avg_penalties: 1.4,
    hbh_stats: {
      par3_avg: 3.4,
      par4_avg: 4.7,
      par5_avg: 5.5,
      hbh_rounds_count: 8,
      scoring_breakdown: {
        ace: 0,
        albatross: 0,
        eagle: 1,
        birdie: 14,
        par: 57,
        bogey: 48,
        double_plus: 18,
      },
    },
    scoring_profile: {
      normalized_counts: {
        birdie_plus: 15,
        par: 57,
        bogey: 48,
        double_plus: 18,
      },
      normalized_total_holes: 138,
      percentages: {
        birdie_plus: 10.87,
        par: 41.3,
        bogey: 34.78,
        double_plus: 13.04,
      },
      averages_per_round: {
        birdie_plus: 1.88,
        par: 7.13,
        bogey: 6,
        double_plus: 2.25,
      },
      source_round_count: 8,
      normalization: 'combined_18_equivalent',
    },
    isPremium: false,
    limitedToLast20: false,
    totalRoundsInDb: 8,
    user: { first_name: 'Test', last_name: 'User' },
    latestRoundUpdatedAt: '2026-02-24T10:00:00.000Z',
    overallInsightsSummary: {
      lastUpdatedAt: '2026-02-24T09:55:00.000Z',
      mode: 'combined',
      roundsRecent: 5,
      recentWindow: 5,
      scoreTrendDelta: -0.8,
      trajectoryLabel: 'Improving',
      consistencyLabel: 'Stable',
      consistencySpread: 2.1,
      projectionScore: 77.8,
      projectionScoreRange: { low: 76.9, high: 79.1 },
      projectionHandicap: 7.8,
      sgComponentDelta: {
        offTee: -0.2,
        approach: -0.1,
        putting: -0.5,
        penalties: -0.3,
        residual: 0.1,
      },
      biggestLeakComponent: 'putting',
      confidence: 'medium',
      persistenceSignal: null,
      dataQualityFlags: {
        insufficientRounds: false,
        missingScoreTrend: false,
        combinedNeedsMoreNineHoleRounds: false,
        missingComponentData: false,
        partialRecentStats: false,
        residualDominant: false,
        volatileScoring: false,
      },
    },
    ...overrides,
  };
}

describe('/dashboard Round Focus card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '1',
          subscription_tier: 'free',
          auth_provider: 'password',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => makeDashboardPayload(),
    });
  });

  it('uses updated dashboard tooltip copy and renders unified scoring summary module', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');

    await waitFor(() => {
      const tooltipTexts = mockInfoTooltip.mock.calls.map(([props]) => props?.text);
      expect(tooltipTexts).toEqual(
        expect.arrayContaining([
          'Your estimated playing ability based on recent rounds. Lower is better.',
          'Your typical score per round. Lower is better.',
          'Your lowest recorded round.',
          'Your highest recorded round.',
          'Rounds included in the current filters.',
          'How often you hit the fairway off the tee. Higher is better.',
          'How often you reach the green in regulation. Higher is better.',
          'Average number of putts per round. Lower is better.',
          'Average penalty strokes per round. Lower is better.',
        ]),
      );
      expect(tooltipTexts).not.toContain('Highlights the area impacting your score the most based on recent rounds.');
    });
    expect(screen.getByText('Scoring Summary')).toBeInTheDocument();
    expect(screen.getByText('Par 3')).toBeInTheDocument();
    expect(screen.getByText('Par 4')).toBeInTheDocument();
    expect(screen.getByText('Par 5')).toBeInTheDocument();
    expect(screen.getByText('Scoring Profile')).toBeInTheDocument();
    expect(screen.getByText('Birdie+')).toBeInTheDocument();
    expect(screen.getByText('Par')).toBeInTheDocument();
    expect(screen.getByText('Bogey')).toBeInTheDocument();
    expect(screen.getByText('Double+')).toBeInTheDocument();
  });

  it('renders scoring profile percentages without NaN and shows center details on hover/tap selection', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByText('Scoring Profile');
    expect(screen.getByText('11%')).toBeInTheDocument();
    expect(screen.getByText('41%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();

    const doublePlusLegend = screen.getByRole('listitem', { name: 'Double+: 13%' });
    fireEvent.mouseEnter(doublePlusLegend);
    expect(doublePlusLegend.className).toContain('is-active');
    expect(document.querySelector('.scoring-profile-center-label')?.textContent).toBe('Double+');
    expect(document.querySelector('.scoring-profile-center-percent')?.textContent).toBe('13%');
    expect(screen.getByText('2.3 / round')).toBeInTheDocument();

    const parLegend = screen.getByRole('listitem', { name: 'Par: 41%' });
    fireEvent.click(parLegend);
    fireEvent.mouseLeave(parLegend);
    expect(parLegend.className).toContain('is-active');
    expect(doublePlusLegend.className).not.toContain('is-active');
    expect(document.querySelector('.scoring-profile-center-label')?.textContent).toBe('Par');
    expect(document.querySelector('.scoring-profile-center-percent')?.textContent).toBe('41%');
    expect(screen.getByText('7.1 / round')).toBeInTheDocument();
  });

  it('renders safe hole type fallback state when par averages are missing', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          hbh_stats: {
            ...makeDashboardPayload().hbh_stats,
            par3_avg: null,
            par4_avg: null,
            par5_avg: null,
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Scoring Summary');
    expect(
      screen.getByText(
        'Use Live Round to unlock Par 3, Par 4, and Par 5 scoring.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
  });

  it('formats hole type averages with one decimal and uses simplified delta labels', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          hbh_stats: {
            ...makeDashboardPayload().hbh_stats,
            par3_avg: 8,
            par4_avg: 4.5,
            par5_avg: 5,
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Scoring Summary');
    expect(screen.getByText('Avg 8.0')).toBeInTheDocument();
    expect(screen.getByText('Avg 4.5')).toBeInTheDocument();
    expect(screen.getByText('Avg 5.0')).toBeInTheDocument();
    expect(screen.getByText('+5.0')).toBeInTheDocument();
    expect(screen.queryByText(/vs par/i)).not.toBeInTheDocument();
  });

  it.each([
    ['low', 'Building', 'is-low'],
    ['medium', 'Moderate', 'is-medium'],
    ['high', 'Strong', 'is-high'],
  ] as const)('renders Round Focus confidence pill for %s confidence', async (confidence, label, toneClass) => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            confidence,
          },
        }),
    });

    render(<DashboardPage />);

    const pill = await screen.findByRole('button', { name: new RegExp(`Focus confidence: ${label}`, 'i') });
    expect(pill).toHaveClass('dashboard-focus-confidence-pill');
    expect(pill).toHaveClass(toneClass);
  });

  it('shows Focus Confidence tooltip copy when confidence pill is clicked', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    const pill = await screen.findByRole('button', { name: /Focus confidence: Moderate/i });
    fireEvent.click(pill);
    expect(await screen.findByText('Focus Confidence')).toBeInTheDocument();
    expect(screen.getByText(/How reliable your Round Focus is based on available scoring patterns\./i)).toBeInTheDocument();
    expect(screen.getByText(/Building: early guidance while GolfIQ learns your game\./i)).toBeInTheDocument();
    expect(screen.getByText(/Moderate: trends are forming\./i)).toBeInTheDocument();
    expect(screen.getByText(/Strong: clear patterns are available\./i)).toBeInTheDocument();
  });

  it('renders Round Focus header with title and confidence pill only (no old info icon tooltip)', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    expect(screen.getByText('Round Focus')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Focus confidence: Moderate/i })).toBeInTheDocument();
    const tooltipTexts = mockInfoTooltip.mock.calls.map(([props]) => props?.text);
    expect(tooltipTexts).not.toContain('Highlights the area impacting your score the most based on recent rounds.');
  });

  it('shows free focus card with directional copy and no SG numeric precision', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    const focusCard = await screen.findByTestId('dashboard-focus-card');
    await screen.findByText('Round Focus');
    expect(screen.getByText('This area is costing you the most strokes.')).toBeInTheDocument();
    expect(screen.getByText('Next Round: Focus on lag speed.')).toBeInTheDocument();
    expect(screen.queryByText(/strokes per round/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compared to baseline/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Build on momentum.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Off the Tee is costing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strokes gained/i)).not.toBeInTheDocument();
    expect(focusCard.querySelector('.dashboard-focus-breakdown')).toBeNull();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See Full Breakdown' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/insights');
    });
  });

  it('shows premium component focus with clear leak and action', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            scoreTrendDelta: 0.6,
            biggestLeakComponent: 'approach',
            sgComponentDelta: {
              offTee: -0.2,
              approach: -0.7,
              putting: -0.3,
              penalties: -0.2,
              residual: 0.0,
            },
            dataQualityFlags: {
              ...makeDashboardPayload().overallInsightsSummary.dataQualityFlags,
              volatileScoring: true,
            },
          },
        }),
    });

    render(<DashboardPage />);

    const focusCard = await screen.findByTestId('dashboard-focus-card');
    await screen.findByText('Approach is the biggest opportunity right now.');
    expect(screen.getByText("You're losing about 0.7 strokes per round.")).toBeInTheDocument();
    expect(screen.getByText('Next Round: Play to the center of the green.')).toBeInTheDocument();
    expect(focusCard.querySelector('.dashboard-focus-breakdown')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'See Full Breakdown' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/insights');
    });
  });

  it('consumes persistence signal so recurring approach issue can win over a one-off lower SG component', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            confidence: 'high',
            sgComponentDelta: {
              offTee: -0.08,
              approach: -0.22,
              putting: -0.28,
              penalties: -0.04,
              residual: -0.1,
            },
            persistenceSignal: {
              component: 'approach',
              count: 4,
              window: 5,
              tier: 'persistent',
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Approach is the clearest scoring focus right now.');
    expect(screen.getByText('Next Round: Play to the center of the green.')).toBeInTheDocument();
  });

  it('shows volatility-priority focus on dashboard when volatility outweighs mild component leaks', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            confidence: 'high',
            roundsRecent: 6,
            sgComponentDelta: {
              offTee: -0.05,
              approach: -0.22,
              putting: -0.08,
              penalties: -0.03,
              residual: 0.02,
            },
            dataQualityFlags: {
              ...makeDashboardPayload().overallInsightsSummary.dataQualityFlags,
              volatileScoring: true,
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Scoring volatility is your top priority.');
    expect(screen.getByText('Next Round: Play to center-green targets.')).toBeInTheDocument();
    expect(screen.queryByText(/is the biggest opportunity right now/i)).not.toBeInTheDocument();
  });

  it('keeps balanced-state focus actionable at dashboard boundary with one clear next-round action', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            confidence: 'medium',
            sgComponentDelta: {
              offTee: -0.05,
              approach: 0.02,
              putting: 0.14,
              penalties: -0.14,
              residual: 0.8,
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('No single area clearly dominates right now.');
    expect(screen.getByText('Next Round: Play to center-green targets.')).toBeInTheDocument();
    expect(screen.queryByText('No area clearly stands out as a weakness.')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Next Round:/i)).toHaveLength(1);
  });

  it('shows fallback focus instead of locked text when historical gating flags are present', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            roundsRecent: 2,
            scoreTrendDelta: null,
            dataQualityFlags: {
              ...makeDashboardPayload().overallInsightsSummary.dataQualityFlags,
              insufficientRounds: true,
              missingScoreTrend: true,
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Start with solid decisions.');
    expect(screen.getByText('Early rounds usually come down to missed scoring chances and a few recovery-heavy holes.')).toBeInTheDocument();
    expect(screen.getByText('Next Round: Play to the widest target.')).toBeInTheDocument();
    expect(screen.queryByText('Your scoring is stable.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your scores are improving.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your scores are slipping.')).not.toBeInTheDocument();
    expect(screen.queryByText('Log 5 rounds to unlock your Round Focus.')).not.toBeInTheDocument();
    expect(screen.queryByText('Round Focus is still calibrating.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
    expect(screen.queryByText(/Based on last 5/i)).not.toBeInTheDocument();
  });

  it('shows scoring profile empty state when no normalized hole totals exist', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          scoring_profile: {
            normalized_counts: {
              birdie_plus: 0,
              par: 0,
              bogey: 0,
              double_plus: 0,
            },
            normalized_total_holes: 0,
            percentages: {
              birdie_plus: 0,
              par: 0,
              bogey: 0,
              double_plus: 0,
            },
            source_round_count: 0,
            normalization: 'combined_18_equivalent',
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Scoring Profile');
    expect(screen.getByText('Use Live Round to unlock your scoring profile.')).toBeInTheDocument();
  });

  it('shows Score Trend first-round empty state when there are no trend points', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 0,
          totalRoundsInDb: 0,
          all_rounds: [],
          hbh_stats: {
            ...makeDashboardPayload().hbh_stats,
            par3_avg: null,
            par4_avg: null,
            par5_avg: null,
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Score Trend');
    expect(
      screen.getByText('Add your first round to start building your score trend.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Score Trend')).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
  });

  it('shows Score Trend add-another-round empty state when there is one trend point', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByText('Score Trend');
    expect(
      screen.getByText('Add another round to start seeing your score trend.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Score Trend')).not.toBeInTheDocument();
  });

  it('shows FIR/GIR trend empty state copy when no usable accuracy trend data exists', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          all_rounds: [
            {
              id: 201,
              date: '2026-02-22T00:00:00.000Z',
              score: 80,
              to_par: 8,
              fir_hit: null,
              gir_hit: null,
              putts: 34,
              penalties: 1,
              fir_total: null,
              gir_total: null,
              course: { course_name: 'Course A', club_name: 'Club A', city: 'A', state: 'AA' },
              tee: { tee_id: 1, tee_name: 'Blue' },
            },
            {
              id: 202,
              date: '2026-02-23T00:00:00.000Z',
              score: 81,
              to_par: 9,
              fir_hit: null,
              gir_hit: null,
              putts: 33,
              penalties: 1,
              fir_total: null,
              gir_total: null,
              course: { course_name: 'Course B', club_name: 'Club B', city: 'B', state: 'BB' },
              tee: { tee_id: 2, tee_name: 'White' },
            },
          ],
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('FIR & GIR Trend');
    expect(
      screen.getByText('Track fairways and greens to see accuracy trends over time.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-FIR & GIR Trend')).not.toBeInTheDocument();
  });

  it('uses always-ready fallback copy for missing score trend after enough rounds', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            roundsRecent: 6,
            scoreTrendDelta: null,
            dataQualityFlags: {
              ...makeDashboardPayload().overallInsightsSummary.dataQualityFlags,
              insufficientRounds: false,
              missingScoreTrend: true,
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Start with solid decisions.');
    expect(screen.getByText('Early rounds usually come down to missed scoring chances and a few recovery-heavy holes.')).toBeInTheDocument();
    expect(screen.getByText('Next Round: Play to the widest target.')).toBeInTheDocument();
    expect(screen.queryByText('Log 5 rounds to unlock your Round Focus.')).not.toBeInTheDocument();
    expect(screen.queryByText('Round Focus is still calibrating.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
  });

  it('shows score-only focus when SG component focus is unavailable after unlock', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            roundsRecent: 6,
            scoreTrendDelta: 1.2,
            sgComponentDelta: null,
            dataQualityFlags: {
              ...makeDashboardPayload().overallInsightsSummary.dataQualityFlags,
              insufficientRounds: false,
              missingScoreTrend: false,
              missingComponentData: true,
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Your scores are slipping.');
    expect(
      screen.getByText('Scores are trending higher than usual. Safer choices can steady the pattern.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Next Round: Prioritize conservative targets.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
  });

  it('uses early guidance for low-confidence mixed-signal combined states', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            confidence: 'low',
            roundsRecent: 3,
            scoreTrendDelta: 0.3,
            dataQualityFlags: {
              ...makeDashboardPayload().overallInsightsSummary.dataQualityFlags,
              combinedNeedsMoreNineHoleRounds: true,
            },
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Start with solid decisions.');
    expect(screen.getByText('Early rounds usually come down to missed scoring chances and a few recovery-heavy holes.')).toBeInTheDocument();
    expect(screen.getByText('Next Round: Play to the widest target.')).toBeInTheDocument();
    expect(screen.queryByText('Your scoring is stable.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your scores are improving.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your scores are slipping.')).not.toBeInTheDocument();
    expect(screen.queryByText('Log 5 rounds to unlock your Round Focus.')).not.toBeInTheDocument();
    expect(screen.queryByText('Round Focus is still calibrating.')).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock your Round Focus/i)).not.toBeInTheDocument();
  });

  it('shows updating note when focus summary is stale versus latest round update', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-02-24T10:00:30.000Z').getTime());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          latestRoundUpdatedAt: '2026-02-24T10:00:00.000Z',
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            lastUpdatedAt: '2026-02-24T09:00:00.000Z',
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Updating focus...');
    nowSpy.mockRestore();
  });

  it('hides updating note when round update is stale', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-02-24T10:05:00.000Z').getTime());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          latestRoundUpdatedAt: '2026-02-24T10:00:00.000Z',
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            lastUpdatedAt: '2026-02-24T09:00:00.000Z',
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    await waitFor(() => {
      expect(screen.queryByText('Updating focus...')).not.toBeInTheDocument();
    });
    nowSpy.mockRestore();
  });

  it('renders focus card above limited-stats banner for free users', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          limitedToLast20: true,
          totalRoundsInDb: 28,
        }),
    });

    render(<DashboardPage />);

    const focusCard = await screen.findByTestId('dashboard-focus-card');
    const bannerHeading = await screen.findByText('Limited Stats View');
    const banner = bannerHeading.closest('.info-banner');
    expect(banner).toBeTruthy();
    expect(
      Boolean(focusCard.compareDocumentPosition(banner as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('captures dashboard_focus_viewed with round-focus context', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          overallInsightsSummary: {
            ...makeDashboardPayload().overallInsightsSummary,
            scoreTrendDelta: 2.3,
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    await waitFor(() => {
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.dashboardFocusViewed,
        expect.objectContaining({
          plan: 'free',
          mode: 'combined',
          focus_type: 'component',
          component: 'Putting',
          deltaScore: 2.3,
        }),
        expect.any(Object),
      );
    });
  });

  it('does not show error toast when API responds with legacy no-rounds error message', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({
        type: 'error',
        message: 'No rounds found',
      }),
    });

    render(<DashboardPage />);

    await screen.findByText('Add your first round to start tracking progress.');
    expect(screen.getByText('Start with solid decisions.')).toBeInTheDocument();
    expect(screen.getByText('Log your first round to begin building your scoring baseline.')).toBeInTheDocument();
    expect(screen.getByText('Next Round: Play to the widest target.')).toBeInTheDocument();
    expect(mockShowMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Failed to load dashboard.')).not.toBeInTheDocument();
  });

  it('does not show error modal when stale mode request fails after switching dashboard mode', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    let rejectCombinedRequest: (reason?: unknown) => void = () => {};

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('statsMode=combined')) {
        return new Promise((_, reject) => {
          rejectCombinedRequest = reject;
        });
      }

      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () =>
          makeDashboardPayload({
            total_rounds: 3,
            all_rounds: [],
          }),
      });
    });

    render(<DashboardPage />);

    fireEvent.change(screen.getByLabelText('dashboard-stats-mode-input'), {
      target: { value: '9' },
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('statsMode=9'),
        expect.objectContaining({
          cache: 'no-store',
          credentials: 'include',
        }),
      );
    });

    rejectCombinedRequest(new Error('stale request failed'));

    await waitFor(() => {
      expect(mockShowMessage).not.toHaveBeenCalled();
    });
  });

  it('still shows error modal when active dashboard mode request fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => makeDashboardPayload(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({
          type: 'error',
          message: 'Dashboard mode load failed',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({
          type: 'error',
          message: 'Dashboard mode load failed',
        }),
      });

    render(<DashboardPage />);

    await screen.findByText('Pebble Beach');

    fireEvent.change(screen.getByLabelText('dashboard-stats-mode-input'), {
      target: { value: '9' },
    });

    await waitFor(() => {
      expect(mockShowMessage).toHaveBeenCalledWith('Dashboard mode load failed', 'error');
    });
    consoleErrorSpy.mockRestore();
  });

  it('shows zero-round welcome beta modal once before acknowledgment', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 0,
          totalRoundsInDb: 0,
          all_rounds: [],
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenWelcomeCall = mockUpgradeModal.mock.calls.some(
        ([props]) =>
          props.title === 'Welcome to GolfIQ' &&
          props.titleBadge === 'Beta' &&
          props.isOpen === true &&
          props.analyticsMode === 'none' &&
          props.primaryButtonLabel === 'Got It' &&
          props.showCloseButton === false &&
          props.ctaLocation === 'dashboard_zero_rounds_beta_modal' &&
          props.milestoneRound === 0,
      );
      expect(hasOpenWelcomeCall).toBe(true);
    });
  });

  it('does not re-show zero-round welcome modal after acknowledgment', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    localStorage.setItem('milestone-modal-ack:1:welcome:0', 'true');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 0,
          totalRoundsInDb: 0,
          all_rounds: [],
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenWelcomeCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Welcome to GolfIQ' && props.isOpen === true,
      );
      expect(hasOpenWelcomeCall).toBe(false);
    });
  });

  it('shows round-3 unlock modal with non-upgrade behavior', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 3,
          totalRoundsInDb: 3,
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUnlockCall = mockUpgradeModal.mock.calls.some(
        ([props]) =>
          props.title === 'Handicap & SG Unlocked' &&
          props.isOpen === true &&
          props.analyticsMode === 'none' &&
          props.primaryButtonLabel === 'View Insights' &&
          props.secondaryButtonLabel === 'Got It' &&
          props.ctaLocation === 'dashboard_round_three_unlock_modal' &&
          props.milestoneRound === 3,
      );
      expect(hasOpenUnlockCall).toBe(true);
    });
  });

  it('keeps round-3 unlock modal dismissed across stats mode switches after acknowledgment', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(rawUrl, 'http://localhost');
      const mode = parsed.searchParams.get('statsMode');

      let payload = makeDashboardPayload({
        total_rounds: 3,
        totalRoundsInDb: 3,
      });

      if (mode === '9') {
        payload = makeDashboardPayload({
          total_rounds: 0,
          totalRoundsInDb: 3,
          all_rounds: [],
          hbh_stats: {
            par3_avg: null,
            par4_avg: null,
            par5_avg: null,
            hbh_rounds_count: 0,
            scoring_breakdown: {
              ace: 0,
              albatross: 0,
              eagle: 0,
              birdie: 0,
              par: 0,
              bogey: 0,
              double_plus: 0,
            },
          },
        });
      }

      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => payload,
      });
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUnlockCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Handicap & SG Unlocked' && props.isOpen === true,
      );
      expect(hasOpenUnlockCall).toBe(true);
    });

    const initialUnlockCall = [...mockUpgradeModal.mock.calls]
      .reverse()
      .find(([props]) => props.title === 'Handicap & SG Unlocked' && props.isOpen === true);
    expect(initialUnlockCall).toBeTruthy();

    await act(async () => {
      initialUnlockCall?.[0]?.onClose?.();
    });

    expect(localStorage.getItem('milestone-modal-ack:1:unlock:3')).toBe('true');

    mockUpgradeModal.mockClear();

    fireEvent.change(screen.getByLabelText('dashboard-stats-mode-input'), {
      target: { value: '9' },
    });

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('statsMode=9'))).toBe(true);
    });

    await waitFor(() => {
      const hasOpenUnlockCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Handicap & SG Unlocked' && props.isOpen === true,
      );
      expect(hasOpenUnlockCall).toBe(false);
    });
  });

  it('shows premium upsell modal at round 5 for free users', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 5,
          totalRoundsInDb: 5,
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUpgradeCall = mockUpgradeModal.mock.calls.some(
        ([props]) =>
          props.title === 'Unlock Premium Insights' &&
          props.isOpen === true &&
          props.ctaLocation === 'dashboard_round_milestone_modal' &&
          props.milestoneRound === 5 &&
          String(props.message).includes('5 rounds logged'),
      );
      expect(hasOpenUpgradeCall).toBe(true);
    });
  });

  it('does not show premium upsell modal at round 5 for premium users', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 5,
          totalRoundsInDb: 5,
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const upgradeCall = mockUpgradeModal.mock.calls.find(
        ([props]) => props.title === 'Unlock Premium Insights',
      );
      expect(upgradeCall).toBeTruthy();
      expect(upgradeCall[0]).toEqual(expect.objectContaining({ isOpen: false }));
    });
  });

  it('re-shows round-3 unlock after rounds drop below 3 and return to 3', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    localStorage.setItem('milestone-modal-ack:1:unlock:3', 'true');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 3,
          totalRoundsInDb: 3,
        }),
    });

    const firstRender = render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUnlockCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Handicap & SG Unlocked' && props.isOpen === true,
      );
      expect(hasOpenUnlockCall).toBe(false);
    });

    firstRender.unmount();
    mockUpgradeModal.mockClear();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 2,
          totalRoundsInDb: 2,
        }),
    });

    const secondRender = render(<DashboardPage />);

    await waitFor(() => {
      expect(localStorage.getItem('milestone-modal-ack:1:unlock:3')).toBeNull();
    });

    secondRender.unmount();
    mockUpgradeModal.mockClear();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 3,
          totalRoundsInDb: 3,
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUnlockCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Handicap & SG Unlocked' && props.isOpen === true,
      );
      expect(hasOpenUnlockCall).toBe(true);
    });
  });

  it('re-shows round-5 upgrade modal after rounds drop below 5 and return to 5', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    localStorage.setItem('milestone-modal-ack:1:upgrade:5', 'true');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 5,
          totalRoundsInDb: 5,
        }),
    });

    const firstRender = render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUpgradeCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Unlock Premium Insights' && props.isOpen === true,
      );
      expect(hasOpenUpgradeCall).toBe(false);
    });

    firstRender.unmount();
    mockUpgradeModal.mockClear();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 4,
          totalRoundsInDb: 4,
        }),
    });

    const secondRender = render(<DashboardPage />);

    await waitFor(() => {
      expect(localStorage.getItem('milestone-modal-ack:1:upgrade:5')).toBeNull();
    });

    secondRender.unmount();
    mockUpgradeModal.mockClear();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          total_rounds: 5,
          totalRoundsInDb: 5,
        }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const hasOpenUpgradeCall = mockUpgradeModal.mock.calls.some(
        ([props]) => props.title === 'Unlock Premium Insights' && props.isOpen === true,
      );
      expect(hasOpenUpgradeCall).toBe(true);
    });
  });
});

