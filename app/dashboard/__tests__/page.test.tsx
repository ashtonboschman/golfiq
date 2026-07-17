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
    scramblingPct: 40,
    shortGameShotsAvg: 4.8,
    upAndDownPct: 25,
    sandSavePct: 50,
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
        double: 10,
        triple_plus: 8,
      },
      normalized_total_holes: 138,
      percentages: {
        birdie_plus: 10.87,
        par: 41.3,
        bogey: 34.78,
        double: 7.25,
        triple_plus: 5.8,
      },
      averages_per_round: {
        birdie_plus: 1.88,
        par: 7.13,
        bogey: 6,
        double: 1.25,
        triple_plus: 1,
      },
      source_round_count: 8,
      normalization: 'combined_18_equivalent',
    },
    isPremium: false,
    limitedToLast20: false,
    totalRoundsInDb: 8,
    user: { first_name: 'Test', last_name: 'User' },
    roundFocus: makeRoundFocus({
      selectedCategory: 'putting',
      confidence: 'moderate',
      baselineDirection: 'stable',
    }),
    ...overrides,
  };
}

function makeRoundFocus(overrides: Record<string, unknown> = {}) {
  return {
    version: 'dashboard_round_focus_v2',
    tier: 'free',
    source: 'trend',
    relationship: 'trend_only',
    selectedCategory: 'approach',
    confidence: 'strong',
    trendState: 'component',
    baselineDirection: 'worse',
    latestRoundCategory: null,
    latestRoundPolarity: null,
    sourceRoundId: null,
    trendReason: 'negative_declining',
    latestRoundUnavailableReason: 'missing_identity',
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
          'How often you make par or better after missing the green. Higher is better.',
          'Average chips and greenside bunker shots per round. Lower is better.',
          'How often you save par or better after one short-game shot and one putt or fewer. Higher is better.',
          'How often you make par or better after a greenside bunker shot. Higher is better.',
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
    expect(screen.getByText('Double')).toBeInTheDocument();
    expect(screen.getByText('Triple+')).toBeInTheDocument();
  });

  it('defaults free users to Last 20 Rounds and keeps date-based filters premium-gated', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');

    const dateFilterSelect = screen.getByLabelText('dashboard-date-filter-input') as HTMLSelectElement;
    expect(dateFilterSelect.value).toBe('last20');
    expect(screen.getByRole('option', { name: 'Last 20 Rounds' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All Time (Premium)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 30 Days (Premium)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 90 Days (Premium)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last Year (Premium)' })).toBeInTheDocument();

    expect(
      (global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('dateFilter=all')),
    ).toBe(true);

    fireEvent.change(dateFilterSelect, {
      target: { value: 'all' },
    });

    expect(mockPush).toHaveBeenCalledWith('/pricing');
    expect(dateFilterSelect.value).toBe('last20');
  });

  it('renders short-game metric cards in Performance Overview', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByText('Performance Overview');
    expect(screen.getByText('Scrambling')).toBeInTheDocument();
    expect(screen.getByText('Short Game')).toBeInTheDocument();
    expect(screen.getByText('Up & Down')).toBeInTheDocument();
    expect(screen.getByText('Sand Saves')).toBeInTheDocument();

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows dash for short-game metric cards when tracked data is unavailable', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          scramblingPct: null,
          shortGameShotsAvg: null,
          upAndDownPct: null,
          sandSavePct: null,
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Performance Overview');
    expect(screen.getByText('Scrambling').closest('.dashboard-stat-card')).toHaveTextContent('-');
    expect(screen.getByText('Short Game').closest('.dashboard-stat-card')).toHaveTextContent('-');
    expect(screen.getByText('Up & Down').closest('.dashboard-stat-card')).toHaveTextContent('-');
    expect(screen.getByText('Sand Saves').closest('.dashboard-stat-card')).toHaveTextContent('-');
  });

  it('renders scoring profile percentages without NaN and shows center details on hover/tap selection', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByText('Scoring Profile');
    expect(screen.getByText('11%')).toBeInTheDocument();
    expect(screen.getByText('41%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
    expect(screen.getByText('6%')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();

    const triplePlusLegend = screen.getByRole('listitem', { name: 'Triple+: 6%' });
    fireEvent.mouseEnter(triplePlusLegend);
    expect(triplePlusLegend.className).toContain('is-active');
    expect(document.querySelector('.scoring-profile-center-label')?.textContent).toBe('Triple+');
    expect(document.querySelector('.scoring-profile-center-percent')?.textContent).toBe('6%');
    expect(screen.getByText('1.0 / round')).toBeInTheDocument();

    const parLegend = screen.getByRole('listitem', { name: 'Par: 41%' });
    fireEvent.click(parLegend);
    fireEvent.mouseLeave(parLegend);
    expect(parLegend.className).toContain('is-active');
    expect(triplePlusLegend.className).not.toContain('is-active');
    expect(document.querySelector('.scoring-profile-center-label')?.textContent).toBe('Par');
    expect(document.querySelector('.scoring-profile-center-percent')?.textContent).toBe('41%');
    expect(screen.getByText('7.1 / round')).toBeInTheDocument();

    fireEvent.click(parLegend);
    fireEvent.mouseLeave(parLegend);
    expect(parLegend.className).not.toContain('is-active');
    expect(document.querySelector('.scoring-profile-center-label')).toBeNull();
    expect(document.querySelector('.scoring-profile-center-percent')).toBeNull();

    fireEvent.click(parLegend);
    expect(parLegend.className).toContain('is-active');
    expect(document.querySelector('.scoring-profile-center-label')?.textContent).toBe('Par');
    expect(document.querySelector('.scoring-profile-center-percent')?.textContent).toBe('41%');
  });

  it('deselects a scoring profile legend item on second tap in coarse-pointer mode without requiring mouse leave', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === '(hover: hover) and (pointer: fine)' ? false : false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    try {
      render(<DashboardPage />);

      await screen.findByText('Scoring Profile');

      const triplePlusLegend = screen.getByRole('listitem', { name: 'Triple+: 6%' });
      fireEvent.focus(triplePlusLegend);
      fireEvent.click(triplePlusLegend);
      expect(triplePlusLegend.className).toContain('is-active');
      expect(document.querySelector('.scoring-profile-center-label')?.textContent).toBe('Triple+');
      expect(document.querySelector('.scoring-profile-center-percent')?.textContent).toBe('6%');

      fireEvent.click(triplePlusLegend);
      expect(triplePlusLegend.className).not.toContain('is-active');
      expect(document.querySelector('.scoring-profile-center-label')).toBeNull();
      expect(document.querySelector('.scoring-profile-center-percent')).toBeNull();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
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

  it('uses 1-decimal rounded deltas for moderate/severe/even bucket classes', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          hbh_stats: {
            ...makeDashboardPayload().hbh_stats,
            par3_avg: 4.46, // +1.46 => +1.5 (severe)
            par4_avg: 4.04, // +0.04 => E (even)
            par5_avg: 6.44, // +1.44 => +1.4 (moderate)
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Scoring Summary');
    expect(screen.getByText('Avg 4.5')).toBeInTheDocument();
    expect(screen.getByText('Avg 4.0')).toBeInTheDocument();
    expect(screen.getByText('Avg 6.4')).toBeInTheDocument();

    const severeVs = screen.getByText('+1.5').closest('.stats-par-chart-vs');
    const evenVs = screen.getByText('E').closest('.stats-par-chart-vs');
    const moderateVs = screen.getByText('+1.4').closest('.stats-par-chart-vs');

    expect(severeVs).toHaveClass('is-severe');
    expect(evenVs).toHaveClass('is-even');
    expect(moderateVs).toHaveClass('is-moderate');
  });

  it('uses 1-decimal rounded deltas for under and near bucket classes', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          hbh_stats: {
            ...makeDashboardPayload().hbh_stats,
            par3_avg: 2.94, // -0.06 => -0.1 (under)
            par4_avg: 4.14, // +0.14 => +0.1 (near)
            par5_avg: 5, // E
          },
        }),
    });

    render(<DashboardPage />);

    await screen.findByText('Scoring Summary');
    const underVs = screen.getByText('-0.1').closest('.stats-par-chart-vs');
    const nearVs = screen.getByText('+0.1').closest('.stats-par-chart-vs');

    expect(underVs).toHaveClass('is-under');
    expect(nearVs).toHaveClass('is-near');
  });

  it.each([
    ['building', 'Building', 'is-low'],
    ['moderate', 'Moderate', 'is-medium'],
    ['strong', 'Strong', 'is-high'],
  ] as const)('renders Round Focus confidence pill for %s confidence', async (confidence, label, toneClass) => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({ confidence }),
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
    expect(screen.getByText('Confidence reflects how much reliable tracked evidence supports this focus.')).toBeInTheDocument();
    expect(screen.queryByText('Confidence reflects how consistently this pattern appears across your recent tracked rounds.')).not.toBeInTheDocument();
  });

  it('uses the canonical relationship wording without a retired qualifier', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            relationship: 'latest_round_improved_against_trend',
            latestRoundCategory: 'approach',
            latestRoundPolarity: 'strength',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByRole('button', { name: 'See Full Breakdown' });
    expect(await screen.findByText('Approach is the clearest scoring focus right now.')).toBeInTheDocument();
    expect(screen.getByText('It was stronger in your latest round, but the broader pattern still deserves attention.')).toBeInTheDocument();
    expect(screen.queryByText('Your latest round was strong, but your longer-term trend still points here.')).not.toBeInTheDocument();

    expect(screen.queryByText('Recent 5 Rounds')).not.toBeInTheDocument();
  });

  it('renders same-category inconclusive wording from the permanent focus contract', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            relationship: 'latest_round_inconclusive_same_category',
            latestRoundCategory: 'approach',
            latestRoundPolarity: 'neutral',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByRole('button', { name: 'See Full Breakdown' });
    expect(screen.getByText('Approach is the clearest scoring focus right now.')).toBeInTheDocument();
    expect(screen.getByText('Your latest round did not clearly confirm or reverse that pattern.')).toBeInTheDocument();
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

  it('renders permanent free focus wording without numeric evidence or retired copy', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => makeDashboardPayload({ roundFocus: makeRoundFocus() }),
    });

    render(<DashboardPage />);

    const card = await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Approach is the clearest scoring focus right now.')).toBeInTheDocument();
    expect(card.querySelector('.dashboard-focus-headline')).toHaveTextContent('Approach is the clearest scoring focus right now.');
    expect(card.querySelector('.dashboard-focus-headline')).not.toHaveTextContent(/^Approach$/);
    expect(screen.getByText('It has been the most consistent area holding back your recent scoring.')).toBeInTheDocument();
    expect(screen.getByText('Next round:')).toBeInTheDocument();
    expect(screen.getByText('Choose targets that leave the largest margin for error.')).toBeInTheDocument();
    expect(screen.queryByText('Recent 5 Rounds')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus confidence: Strong' })).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/SG/);
    expect(screen.queryByText('Putting is costing you the most strokes.')).not.toBeInTheDocument();
  });

  it('does not render numeric evidence for the same Premium focus', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => makeDashboardPayload({
        isPremium: true,
        roundFocus: makeRoundFocus({
          tier: 'premium',
          evidence: {
            recentAverage: -0.76,
            baselineAverage: -0.34,
            baselineDelta: -0.42,
            trackedRecentCount: 5,
            negativeRecentCount: 5,
            lowestComponentCount: 4,
            separation: 0.28,
          },
        }),
      }),
    });

    render(<DashboardPage />);

    const card = await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Approach is the clearest scoring focus right now.')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('Recent 5 Rounds');
    expect(card).not.toHaveTextContent('Recent:');
    expect(card).not.toHaveTextContent(/SG|Earlier:|-0\.8|-0\.3/);
  });

  it('uses safe neutral copy when the permanent focus payload is missing', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => makeDashboardPayload({ roundFocus: undefined }),
    });

    render(<DashboardPage />);

    expect(await screen.findByText('There is not enough consistent evidence to name one focus yet.')).toBeInTheDocument();
    expect(screen.queryByText('Putting is costing you the most strokes.')).not.toBeInTheDocument();
  });

  it('labels a latest-round fallback and does not create source-round navigation without a permitted ID', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => makeDashboardPayload({
        roundFocus: makeRoundFocus({
          source: 'latest_round',
          relationship: 'latest_round_fallback',
          selectedCategory: 'penalties',
          confidence: 'moderate',
          trendState: 'no_clear_separator',
          baselineDirection: null,
          latestRoundCategory: 'penalties',
          latestRoundPolarity: 'weakness',
          latestRoundUnavailableReason: null,
        }),
      }),
    });

    render(<DashboardPage />);

    const card = await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Keeping penalties off the card is the clearest focus from your latest round.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus confidence: Moderate' })).toBeInTheDocument();
    expect(screen.getByText('Prioritize keeping penalty trouble out of play.')).toBeInTheDocument();
    expect(card.querySelector('a[href*="/rounds/"]')).toBeNull();
  });

  it('keeps the free card actionable without SG numeric precision', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    await screen.findByText('Putting is the clearest scoring focus right now.');
    expect(screen.getByText('It has been the most consistent area holding back your recent scoring.')).toBeInTheDocument();
    expect(screen.queryByText(/strokes per round/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compared to baseline/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Build on momentum.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Off the Tee is costing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strokes gained/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See Full Breakdown' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/insights');
    });
  });

  it('shows the Premium component focus without compact numeric evidence', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            tier: 'premium',
            selectedCategory: 'approach',
            baselineDirection: 'worse',
            evidence: {
              recentAverage: -0.7,
              baselineAverage: -0.3,
              baselineDelta: -0.4,
              trackedRecentCount: 5,
              negativeRecentCount: 5,
              lowestComponentCount: 4,
              separation: 0.3,
            },
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    await screen.findByText('Approach is the clearest scoring focus right now.');
    expect(screen.getByTestId('dashboard-focus-card')).not.toHaveTextContent(/Recent:|Earlier:|SG|-0\.7|-0\.3/);

    fireEvent.click(screen.getByRole('button', { name: 'See Full Breakdown' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/insights');
    });
  });

  it('renders the all-positive conclusion without manufacturing a weakness', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'neutral',
            relationship: 'no_supported_focus',
            selectedCategory: null,
            confidence: 'building',
            trendState: 'all_positive',
            baselineDirection: null,
          }),
        }),
    });

    render(<DashboardPage />);

    expect(await screen.findByText('No single area stands out as a weakness across your recent rounds.')).toBeInTheDocument();
    expect(screen.getByText('Your recent play has been balanced, so there is no need to force a single focus yet.')).toBeInTheDocument();
    expect(screen.queryByText(/^Next round:/i)).not.toBeInTheDocument();
  });

  it('renders a different-category conflict with explicit timeframe context', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            relationship: 'latest_round_conflicts',
            latestRoundCategory: 'putting',
            latestRoundPolarity: 'weakness',
          }),
        }),
    });

    render(<DashboardPage />);

    expect(await screen.findByText('Approach is the clearest scoring focus right now.')).toBeInTheDocument();
    expect(screen.getByText('Your latest round pointed more toward putting, but approach has been the more consistent pattern.')).toBeInTheDocument();
    expect(screen.getByText('Choose targets that leave the largest margin for error.')).toBeInTheDocument();
  });

  it('renders a volatility fallback as latest-round guidance', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'latest_round',
            relationship: 'latest_round_fallback',
            selectedCategory: 'volatility',
            confidence: 'moderate',
            trendState: 'no_clear_separator',
            baselineDirection: null,
            latestRoundCategory: 'volatility',
            latestRoundPolarity: 'weakness',
          }),
        }),
    });

    render(<DashboardPage />);

    expect(await screen.findByText('Improving scoring consistency is the clearest focus from your latest round.')).toBeInTheDocument();
    expect(screen.getByText('Keep the plan simple and avoid compounding mistakes.')).toBeInTheDocument();
  });

  it('renders the projected balanced state without manufacturing an action', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'neutral',
            relationship: 'no_supported_focus',
            selectedCategory: null,
            confidence: 'building',
            trendState: 'no_clear_separator',
            baselineDirection: null,
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Your recent rounds are balanced enough that no single focus stands out yet.')).toBeInTheDocument();
    expect(screen.getByText('Keep tracking complete rounds and GolfIQ will surface a focus when one separates clearly.')).toBeInTheDocument();
    expect(screen.queryByText(/^Next round:/i)).not.toBeInTheDocument();
  });

  it('uses the projected Building state for insufficient history', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'neutral',
            relationship: 'no_supported_focus',
            selectedCategory: null,
            confidence: 'building',
            trendState: 'insufficient_evidence',
            baselineDirection: null,
            trendReason: 'fewer_than_five_recent',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Keep logging rounds to build a reliable recent focus.')).toBeInTheDocument();
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
              double: 0,
              triple_plus: 0,
            },
            normalized_total_holes: 0,
            percentages: {
              birdie_plus: 0,
              par: 0,
              bogey: 0,
              double: 0,
              triple_plus: 0,
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

  it('shows Score History first-round empty state when there are no history points', async () => {
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

    await screen.findByText('Score History');
    expect(
      screen.getByText('Add your first round to start seeing how your scores move.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Score History')).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
  });

  it('shows Score History add-another-round empty state when there is one history point', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByText('Score History');
    expect(
      screen.getByText('Add another round to start building a clearer score pattern.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Score History')).not.toBeInTheDocument();
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

    await screen.findByText('FIR & GIR History');
    expect(
      screen.getByText('Track fairways and greens to see if your ball-striking is moving in the right direction.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-FIR & GIR History')).not.toBeInTheDocument();
  });

  it('uses the projected neutral result when no repeated trend is supported', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'neutral',
            relationship: 'no_supported_focus',
            selectedCategory: null,
            confidence: 'building',
            trendState: 'insufficient_evidence',
            baselineDirection: null,
            trendReason: 'no_repeated_negative_component',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('There is not enough consistent evidence to name one focus yet.')).toBeInTheDocument();
    expect(screen.queryByText('Log 5 rounds to unlock your Round Focus.')).not.toBeInTheDocument();
    expect(screen.queryByText('Round Focus is still calibrating.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
  });

  it('shows the projected tracking-coverage state when component data is unavailable', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'neutral',
            relationship: 'no_supported_focus',
            selectedCategory: null,
            confidence: 'building',
            trendState: 'insufficient_evidence',
            baselineDirection: null,
            trendReason: 'insufficient_component_coverage',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Track a few more complete rounds to identify a reliable focus.')).toBeInTheDocument();
    expect(screen.getByText('More complete stat tracking will help GolfIQ separate the areas of your game.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Full Breakdown' })).toBeInTheDocument();
  });

  it('uses the projected early-sample state for fewer than five rounds', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            source: 'neutral',
            relationship: 'no_supported_focus',
            selectedCategory: null,
            confidence: 'building',
            trendState: 'insufficient_evidence',
            baselineDirection: null,
            trendReason: 'fewer_than_five_recent',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    expect(await screen.findByText('Keep logging rounds to build a reliable recent focus.')).toBeInTheDocument();
    expect(screen.queryByText('Your scoring is stable.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your scores are improving.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your scores are slipping.')).not.toBeInTheDocument();
    expect(screen.queryByText('Log 5 rounds to unlock your Round Focus.')).not.toBeInTheDocument();
    expect(screen.queryByText('Round Focus is still calibrating.')).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock your Round Focus/i)).not.toBeInTheDocument();
  });

  it('renders a compact shared history-limit card below the combined note for free users', async () => {
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

    const combinedNote = screen.getByText('9 hole rounds are doubled to approximate 18 hole stats.');
    const historyCardCopy = await screen.findByText('Dashboard stats use most recent 20 of 28 rounds.');
    const historyCard = historyCardCopy.closest('.info-banner');
    const focusCard = await screen.findByTestId('dashboard-focus-card');

    if (!historyCard) {
      throw new Error('Expected history limit card to render.');
    }

    expect(historyCard).toHaveClass('info-banner');
    expect(screen.getByText('Showing Your Latest 20 Rounds')).toBeInTheDocument();
    expect(screen.queryByText('Limited Stats View')).not.toBeInTheDocument();
    expect(
      Boolean(combinedNote.compareDocumentPosition(historyCard) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(historyCard.compareDocumentPosition(focusCard) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock Full History' }));
    expect(mockPush).toHaveBeenCalledWith('/pricing');
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      expect.objectContaining({ cta_location: 'dashboard_limited_stats_banner' }),
      expect.any(Object),
    );
  });

  it('captures impression and CTA analytics with canonical categorical metadata only', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        makeDashboardPayload({
          roundFocus: makeRoundFocus({
            relationship: 'reinforced_by_latest_round',
            selectedCategory: 'off_the_tee',
            confidence: 'strong',
            baselineDirection: 'worse',
            latestRoundCategory: 'off_the_tee',
            latestRoundPolarity: 'weakness',
          }),
        }),
    });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    await waitFor(() => {
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.dashboardFocusViewed,
        expect.objectContaining({
          mode: 'combined',
          source: 'trend',
          relationship: 'reinforced_by_latest_round',
          category: 'off_the_tee',
          confidence: 'strong',
          trendState: 'component',
          baselineDirection: 'worse',
          viewerContext: 'owner',
          subscriptionTier: 'free',
        }),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'See Full Breakdown' }));
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.dashboardFocusCtaClicked,
      expect.objectContaining({
        source: 'trend',
        relationship: 'reinforced_by_latest_round',
        category: 'off_the_tee',
        confidence: 'strong',
        viewerContext: 'owner',
        subscriptionTier: 'free',
      }),
      expect.any(Object),
    );
    const focusCalls = mockedCaptureClientEvent.mock.calls.filter(([event]) =>
      event === ANALYTICS_EVENTS.dashboardFocusViewed ||
      event === ANALYTICS_EVENTS.dashboardFocusCtaClicked,
    );
    expect(JSON.stringify(focusCalls)).not.toMatch(/recommendation|sourceRoundId|recentAverage|baselineAverage|baselineDelta|separation/);
  });

  it('marks friend/public focus analytics as external without private evidence', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => makeDashboardPayload({
        roundFocus: makeRoundFocus({
          source: 'latest_round',
          relationship: 'latest_round_fallback',
          selectedCategory: 'big_numbers',
          confidence: 'moderate',
          trendState: 'no_clear_separator',
          baselineDirection: null,
          latestRoundCategory: 'big_numbers',
          latestRoundPolarity: 'weakness',
          sourceRoundId: null,
        }),
      }),
    });

    render(<DashboardPage userId={2} />);

    await screen.findByText('Avoiding big numbers is the clearest focus from your latest round.');
    await waitFor(() => {
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.dashboardFocusViewed,
        expect.objectContaining({
          source: 'latest_round',
          relationship: 'latest_round_fallback',
          category: 'big_numbers',
          viewerContext: 'external',
          subscriptionTier: 'free',
        }),
        expect.any(Object),
      );
    });
    expect(screen.getByTestId('dashboard-focus-card').querySelector('a[href*="/rounds/"]')).toBeNull();
  });

  it('does not show an error toast for the supported no-rounds response', async () => {
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
    expect(screen.getByText('There is not enough consistent evidence to name one focus yet.')).toBeInTheDocument();
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

  it('suppresses zero-round welcome modal for onboarding-completed users', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    localStorage.setItem(
      'golfiq:onboarding:v1',
      JSON.stringify({
        version: 1,
        selectedGoal: 'Break 90',
        completed: true,
        completedAt: '2026-05-23T00:00:00.000Z',
        lastStep: 5,
        source: 'landing',
        startedAt: '2026-05-23T00:00:00.000Z',
      }),
    );
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
          props.title === 'Handicap and Strokes Gained Unlocked' &&
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
        ([props]) => props.title === 'Handicap and Strokes Gained Unlocked' && props.isOpen === true,
      );
      expect(hasOpenUnlockCall).toBe(true);
    });

    const initialUnlockCall = [...mockUpgradeModal.mock.calls]
      .reverse()
      .find(([props]) => props.title === 'Handicap and Strokes Gained Unlocked' && props.isOpen === true);
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
        ([props]) => props.title === 'Handicap and Strokes Gained Unlocked' && props.isOpen === true,
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
          props.title === 'Unlock Your Full Breakdown' &&
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
        ([props]) => props.title === 'Unlock Your Full Breakdown',
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
        ([props]) => props.title === 'Handicap and Strokes Gained Unlocked' && props.isOpen === true,
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
        ([props]) => props.title === 'Handicap and Strokes Gained Unlocked' && props.isOpen === true,
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
        ([props]) => props.title === 'Unlock Your Full Breakdown' && props.isOpen === true,
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
        ([props]) => props.title === 'Unlock Your Full Breakdown' && props.isOpen === true,
      );
      expect(hasOpenUpgradeCall).toBe(true);
    });
  });
});
