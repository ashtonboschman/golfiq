/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
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

jest.mock('@/components/TrendCard', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid={`trend-${label}`}>{label}</div>,
}));

jest.mock('@/components/RoundCard', () => ({
  __esModule: true,
  default: ({ round }: { round: any }) => <div>{round.course_name}</div>,
}));

jest.mock('@/components/UpgradeModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/InfoTooltip', () => ({
  __esModule: true,
  default: () => <span data-testid="info-tooltip" />,
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
      dataQualityFlags: {
        insufficientRounds: false,
        missingScoreTrend: false,
        combinedNeedsMoreNineHoleRounds: false,
        missingComponentData: false,
        residualDominant: false,
        volatileScoring: false,
      },
    },
    ...overrides,
  };
}

describe('/dashboard Today\'s Focus card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('shows free focus card with only View Insights CTA and no SG component language', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });

    render(<DashboardPage />);

    await screen.findByTestId('dashboard-focus-card');
    await screen.findByText('Round Focus');
    expect(screen.getByText('Turn stability into progress.')).toBeInTheDocument();
    expect(screen.queryByText(/Off the Tee is costing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strokes gained/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Insights' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Insights' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/insights');
    });
  });

  it('shows premium component focus with drill and routes CTA actions', async () => {
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

    await screen.findByText('Priority: Start-line control on approaches.');
    expect(screen.getByText(/Approach is down/i)).toBeInTheDocument();
    expect(screen.getByText(/Do this next:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Insights' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/insights');
    });
  });

  it('shows no button in NEED_MORE_ROUNDS state', async () => {
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

    await screen.findByText('Log 3 rounds to unlock trends.');
    expect(screen.getByText('Trends unlock automatically after your third logged round.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Insights' })).not.toBeInTheDocument();
    expect(screen.queryByText('Based on last 5 vs baseline')).not.toBeInTheDocument();
  });

  it('shows updating note when focus summary is stale versus latest round update', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: false, loading: false });
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
          focus_type: 'score',
          component: null,
          deltaScore: 2.3,
        }),
        expect.any(Object),
      );
    });
  });
});
