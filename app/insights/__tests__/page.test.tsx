/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightsPage from '@/app/insights/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { resolveGameTrendsMode } from '@/lib/insights/gameTrends/resolve';
import { projectGameTrendsForViewer } from '@/lib/insights/gameTrends/presentation';
import type { TrendEvidenceRound } from '@/lib/insights/trendEvidence';

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

function makeGameTrends(
  isPremium: boolean,
  count = 5,
  mode: StatsMode = 'combined',
  scores: { recent: number; baseline: number } = { recent: 74, baseline: 78 },
) {
  const rounds: TrendEvidenceRound[] = Array.from({ length: count }, (_, index) => ({
    roundId: String(index + 1),
    date: new Date(Date.UTC(2026, 5, 15 - index)),
    createdAt: new Date(Date.UTC(2026, 5, 15 - index, 1)),
    holes: mode === '9' ? 9 : 18,
    roundContext: 'real',
    completed: true,
    score: index < 3 ? scores.recent : scores.baseline,
    toPar: index < 3 ? scores.recent - (mode === '9' ? 36 : 72) : scores.baseline - (mode === '9' ? 36 : 72),
    sgPartialAnalysis: false,
    shortGameOpportunityEligible: true,
    components: {
      off_the_tee: 0.4,
      approach: 0.8,
      short_game: -0.2,
      putting: -0.5,
      penalties: -0.1,
    },
  }));
  return projectGameTrendsForViewer(
    resolveGameTrendsMode({ rounds, mode, now: new Date('2026-06-30T00:00:00Z') }),
    isPremium ? 'premium' : 'free',
  );
}

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
      shortGameShots: { recent: 17.2, baseline: 18.6, coverageRecent: '5/5' },
      puttsTotal: { recent: 33.0, baseline: 30.6, coverageRecent: '5/5' },
      penaltiesPerRound: { recent: 1.3, baseline: 1.5, coverageRecent: '5/5' },
    },
    sgComponents: {
      recentAvg: { total: -0.5, offTee: 0.2, approach: -0.8, shortGame: -0.2, putting: -0.6, penalties: 0.1, residual: 0.1 },
      baselineAvg: { total: 0, offTee: 0, approach: 0, shortGame: 0, putting: 0, penalties: 0, residual: 0 },
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

function makeInsights(
  isPremium: boolean,
  modeOverrides?: Partial<Record<StatsMode, Partial<any>>>,
  gameTrendsMode: StatsMode = 'combined',
) {
  const card2 = isPremium
    ? "Approach is starting to show up as the main area costing you strokes. You're losing about 0.8 strokes compared with your recent level."
    : 'Approach is starting to show up as the main area holding scores back. The full breakdown shows exactly how much.';
  return {
    generated_at: '2026-02-12T10:00:00.000Z',
    game_trends: makeGameTrends(
      isPremium,
      5,
      gameTrendsMode,
      gameTrendsMode === '9'
        ? { recent: 39.4, baseline: 41 }
        : gameTrendsMode === '18'
          ? { recent: 76.2, baseline: 76.3 }
          : { recent: 74, baseline: 78 },
    ),
    cards: [
      'Your recent scores are holding close to your normal range.',
      card2,
      'Your scores have some movement to them, but the pattern is still forming.',
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
        handicapCurrent: 3.4,
        projectedHandicapIn10: 3.0,
        handicapLow: 2.8,
        handicapHigh: 4.6,
      },
      '9': {
        trajectory: 'improving',
        projectedScoreIn10: 39.4,
        scoreLow: 38.1,
        scoreHigh: 40.9,
        roundsUsed: 14,
        handicapCurrent: 5.1,
        projectedHandicapIn10: 4.7,
        handicapLow: 4.2,
        handicapHigh: 5.4,
      },
      '18': {
        trajectory: 'flat',
        projectedScoreIn10: 76.2,
        scoreLow: 74.9,
        scoreHigh: 77.8,
        roundsUsed: 12,
        handicapCurrent: 3.6,
        projectedHandicapIn10: 3.5,
        handicapLow: 3.0,
        handicapHigh: 4.1,
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
      shortGameShots: { recent: 17.2, baseline: 18.6, coverageRecent: '5/5' },
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
          shortGame: -0.2,
          putting: -0.6,
          penalties: 0.1,
          residual: 0.1,
          partialAnalysis: false,
        },
        recentAvg: { total: -0.5, offTee: 0.2, approach: -0.8, shortGame: -0.2, putting: -0.6, penalties: 0.1, residual: 0.1 },
        baselineAvg: { total: 0, offTee: 0, approach: 0, shortGame: 0, putting: 0, penalties: 0, residual: 0 },
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

  it('renders the structured free Game Trends roles with no lock overlay CTA', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText('Recent Form');
    expect(screen.queryByText('Insights')).not.toBeInTheDocument();
    expect(
      screen.queryByText('See what is changing across your recent rounds and usual scoring patterns.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Game Trends confidence: Moderate' })).toBeInTheDocument();
    expect(container.querySelector('.insights-badge')).toBeNull();
    expect(screen.queryByRole('button', { name: /Regenerate/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Overall Insights compares your recent rounds (up to 5) against your overall average to detect form trends.')).not.toBeInTheDocument();
    expect(screen.queryByText('Overall Insights compares your recent rounds (up to 5) against your last 20 rounds to detect form trends.')).not.toBeInTheDocument();
    expect(screen.queryByText('Game Profile')).not.toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.getByText('Opportunity')).toBeInTheDocument();
    expect(screen.getByText('Stability')).toBeInTheDocument();
    expect(container.querySelector('.game-trends-card')?.textContent).not.toMatch(/strokes gained|gaining strokes|losing strokes|\bSG\b/i);
    expect(screen.queryByText(/Last updated/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Unlock full Overall Insights')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();
    expect(screen.queryByText('Not enough data')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.overall-insight-fake')).toHaveLength(0);
  });

  it('renders Game Trends before Scoring Direction', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    render(<InsightsPage />);

    const gameTrendsHeading = await screen.findByText('Game Trends');
    const trajectoryHeading = await screen.findByText('Scoring Direction');
    expect(
      Boolean(gameTrendsHeading.compareDocumentPosition(trajectoryHeading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('renders SG sections locked for free and only SG trend lock has pricing CTA', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText('See what is really costing you strokes');

    expect(screen.getByText('See what is really costing you strokes')).toBeInTheDocument();
    expect(screen.getByText('Get a clearer breakdown of what helped, what hurt, and where to focus next.')).toBeInTheDocument();
    expect(screen.getAllByText('Strokes Gained by Area')[0]).toBeInTheDocument();
    expect(screen.getByText('Scoring Direction')).toBeInTheDocument();
    expect(screen.getByText('Score Range')).toBeInTheDocument();
    expect(screen.getByText('Handicap Range')).toBeInTheDocument();
    expect(
      screen.getByText('GolfIQ starts showing where your scores and handicap are heading after 10 rounds.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Scoring Direction (Premium)')).not.toBeInTheDocument();
    expect(screen.getAllByText('Strokes Gained by Area')[0]).toBeInTheDocument();

    expect(container.querySelectorAll('.locked-section')).toHaveLength(2);
    expect(container.querySelectorAll('.locked-blur-content')).toHaveLength(2);
    expect(container.querySelectorAll('.locked-overlay.has-cta')).toHaveLength(1);
    expect(container.querySelector('.trajectory-lock-section')).toBeNull();

    const ctaButtons = screen.getAllByRole('button', { name: 'See Premium Plans' });
    expect(ctaButtons).toHaveLength(1);
  });

  it('reserves the free Scoring Direction upgrade message for a mature sample', async () => {
    const insights = makeInsights(false);
    insights.game_trends = makeGameTrends(false, 10);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    expect(
      await screen.findByText('Upgrade to see projected score and handicap ranges.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('GolfIQ starts showing where your scores and handicap are heading after 10 rounds.'),
    ).not.toBeInTheDocument();
  });

  it('renders premium Game Trends evidence and no unlock CTA', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(true) }),
    });

    render(<InsightsPage />);

    await screen.findByText('Strength');
    expect(screen.getByRole('button', { name: 'Game Trends confidence: Moderate' })).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.getByText('Opportunity')).toBeInTheDocument();
    expect(screen.queryByText('\u25BC -1.4 Short Game Shots')).not.toBeInTheDocument();
    expect(screen.queryByText(/The full breakdown shows exactly how much\./i)).not.toBeInTheDocument();
    expect(screen.queryByText('Unlock full Overall Insights')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Full Insights' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See Premium Plans' })).not.toBeInTheDocument();
    expect(screen.getByText('2.8-4.6')).toBeInTheDocument();

    const sgLabels = Array.from(document.querySelectorAll('.sg-delta-row .sg-delta-label')).map((node) =>
      node.textContent?.trim() ?? '',
    );
    expect(sgLabels).toEqual([
      'Off the Tee',
      'Approach',
      'Short Game',
      'Putting',
      'Penalties',
    ]);

    const perfTitles = Array.from(document.querySelectorAll('.insights-performance-grid .comparison-bar-header h3')).map(
      (node) => node.textContent?.trim() ?? '',
    );
    expect(perfTitles).toEqual([
      'Driving Accuracy',
      'Approach Accuracy',
      'Short Game',
      'Putting',
      'Penalties',
    ]);
  });

  it('shows absolute recent SG component averages without a historical comparison', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true });
    const insights = makeInsights(true);
    insights.projection_by_mode.combined.roundsUsed = 8;
    insights.mode_payload.combined.sgComponents = {
      recentAvg: {
        total: -0.1,
        offTee: 0.24,
        approach: -0.24,
        shortGame: -0.2,
        putting: -0.18,
        penalties: 0.11,
        residual: 0.08,
      },
      baselineAvg: {
        total: -0.1,
        offTee: 0.2,
        approach: -0.2,
        shortGame: -0.16,
        putting: -0.14,
        penalties: 0.07,
        residual: 0.04,
      },
      hasData: true,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    await screen.findByText('Game Trends');
    await screen.findAllByText('Strokes Gained by Area');
    expect(
      screen.getByText(
        'Shows your average strokes gained or lost in each area over your latest five rounds, using rounds with usable tracking. Positive values gained strokes; negative values lost strokes.',
      ),
    ).toBeInTheDocument();

    const offTeeRow = Array.from(document.querySelectorAll('.sg-delta-row')).find(
      (row) => row.querySelector('.sg-delta-label')?.textContent?.trim() === 'Off the Tee',
    );
    const approachRow = Array.from(document.querySelectorAll('.sg-delta-row')).find(
      (row) => row.querySelector('.sg-delta-label')?.textContent?.trim() === 'Approach',
    );
    expect(offTeeRow?.querySelector('.sg-delta-value')).toHaveTextContent('+0.2');
    expect(approachRow?.querySelector('.sg-delta-value')).toHaveTextContent('-0.2');
  });

  it.each([
    [0, ['Average']],
    [1, ['Current']],
    [2, ['Current']],
    [3, ['Current']],
    [4, ['Recent', 'Previous']],
    [5, ['Recent', 'Previous']],
    [6, ['Recent', 'Previous']],
    [9, ['Recent', 'Previous']],
    [10, ['Recent', 'Usual']],
    [19, ['Recent', 'Usual']],
    [20, ['Recent', 'Usual']],
  ] as const)('renders canonical Scoring labels for a %i-round Recent Form sample', async (count, expectedLabels) => {
    const insights = makeInsights(true);
    insights.game_trends = makeGameTrends(true, count);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    const { container } = render(<InsightsPage />);
    await screen.findByText('Game Trends');
    const scoringCard = container.querySelector('.insights-top-grid .comparison-bar-card');
    const labels = Array.from(scoringCard?.querySelectorAll('.comparison-bar-label') ?? [])
      .map((node) => node.textContent?.trim());
    expect(labels).toEqual(expectedLabels);
  });

  it('renders Scoring from the exact canonical Recent Form evidence', async () => {
    const insights = makeInsights(true);
    insights.game_trends.recentForm = {
      ...insights.game_trends.recentForm,
      maturity: 'established',
      evidence: {
        ...insights.game_trends.recentForm.evidence,
        recentCount: 5,
        baselineCount: 8,
        averageScore: 92.4,
        baselineAverageScore: 93.9,
        deltaVsBaseline: -1.5,
      },
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    const { container } = render(<InsightsPage />);
    await screen.findByText('Game Trends');
    const scoringCard = container.querySelector('.insights-top-grid .comparison-bar-card');
    expect(scoringCard).toHaveTextContent('Recent');
    expect(scoringCard).toHaveTextContent('92.4');
    expect(scoringCard).toHaveTextContent('Usual');
    expect(scoringCard).toHaveTextContent('93.9');
    expect(scoringCard).toHaveTextContent('\u25BC -1.5 Strokes');
  });

  it.each([
    [92.4, 93.4, '\u25BC -1.0 Strokes', 'is-up'],
    [94.4, 93.4, '\u25B2 +1.0 Strokes', 'is-down'],
    [93.4, 93.4, '\u2013 0.0 Strokes', 'is-flat'],
  ] as const)(
    'uses directional Scoring comparison copy for %s versus %s',
    async (recent, usual, expectedCopy, expectedTone) => {
      const insights = makeInsights(true);
      insights.game_trends.recentForm = {
        ...insights.game_trends.recentForm,
        maturity: 'established',
        evidence: {
          ...insights.game_trends.recentForm.evidence,
          recentCount: 5,
          baselineCount: 8,
          averageScore: recent,
          baselineAverageScore: usual,
          deltaVsBaseline: recent - usual,
        },
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ insights }),
      });

      const { container } = render(<InsightsPage />);
      await screen.findByText('Game Trends');
      const scoringDelta = container.querySelector(
        '.insights-top-grid .comparison-bar-card .comparison-bar-delta',
      );
      expect(scoringDelta).toHaveTextContent(expectedCopy);
      expect(scoringDelta).toHaveClass(expectedTone);
    },
  );

  it.each([
    [1, ['Current'], false],
    [5, ['Current'], false],
    [6, ['Recent', 'Average'], true],
  ] as const)(
    'renders performance-card comparison rows for a %i-round sample',
    async (roundCount, expectedLabels, expectsDelta) => {
      const insights = makeInsights(true);
      insights.game_trends = makeGameTrends(true, roundCount);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ insights }),
      });

      const { container } = render(<InsightsPage />);
      await screen.findByText('Game Trends');
      const performanceCards = container.querySelectorAll(
        '.insights-performance-grid .comparison-bar-card',
      );
      expect(performanceCards).toHaveLength(5);
      performanceCards.forEach((card) => {
        const labels = Array.from(card.querySelectorAll('.comparison-bar-label'))
          .map((node) => node.textContent?.trim());
        expect(labels).toEqual(expectedLabels);
        if (expectsDelta) {
          expect(card.querySelector('.comparison-bar-delta')).toBeInTheDocument();
        } else {
          expect(card.querySelector('.comparison-bar-delta')).toBeNull();
        }
      });
    },
  );

  it('waits for three real handicap points before showing handicap history', async () => {
    const firstRoundTrend = {
      ...makeModePayload().trend,
      labels: ['Jun 16'],
      handicap: [null],
      sgTotal: [null],
    };
    const insights = makeInsights(true, {
      combined: {
        trend: firstRoundTrend,
        sgComponents: { recentAvg: null, baselineAvg: null, hasData: false },
      },
    });
    insights.game_trends = makeGameTrends(true, 1);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    const firstRoundView = render(<InsightsPage />);
    await screen.findByText('Complete 2 more rounds to establish your first handicap.');
    expect(screen.getByText('Complete 5 more rounds to start seeing your strokes gained history.')).toBeInTheDocument();
    expect(
      screen.getByText('Your area breakdown will begin once GolfIQ has established your handicap and you complete a fully tracked round.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Handicap History')).not.toBeInTheDocument();
    firstRoundView.unmount();

    const threeRoundTrend = {
      ...makeModePayload().trend,
      labels: ['Jun 14', 'Jun 15', 'Jun 16'],
      handicap: [null, null, 4.4],
      sgTotal: [null, null, null],
    };
    const threeRoundInsights = makeInsights(true, { combined: { trend: threeRoundTrend } });
    threeRoundInsights.game_trends = makeGameTrends(true, 3);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: threeRoundInsights }),
    });

    const firstHandicapView = render(<InsightsPage />);
    await screen.findByText('Complete 2 more rounds to start seeing your handicap history.');
    expect(screen.getByText('Complete 3 more rounds to start seeing your strokes gained history.')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Handicap History')).not.toBeInTheDocument();
    firstHandicapView.unmount();

    const historyTrend = {
      ...makeModePayload().trend,
      handicap: [null, null, 4.4, 4.2, 4.1],
      sgTotal: [null, null, null, 0.2, 0.4],
    };
    const historyInsights = makeInsights(true, { combined: { trend: historyTrend } });
    historyInsights.game_trends = makeGameTrends(true, 5);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: historyInsights }),
    });

    render(<InsightsPage />);
    expect(await screen.findByTestId('trend-Handicap History')).toBeInTheDocument();
    expect(screen.queryByText(/more rounds? to start seeing your handicap history/i)).not.toBeInTheDocument();
  });

  it('keeps Handicap and Strokes Gained trends date-aligned while gating each by its own usable points', async () => {
    const staggeredTrend = {
      ...makeModePayload().trend,
      labels: ['Jun 12', 'Jun 13', 'Jun 14', 'Jun 15', 'Jun 16'],
      handicap: [null, null, 4.4, 4.2, 4.1],
      sgTotal: [null, null, null, 0.2, 0.4],
    };
    const insights = makeInsights(true, { combined: { trend: staggeredTrend } });
    insights.game_trends = makeGameTrends(true, 5);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    const staggeredView = render(<InsightsPage />);
    expect(await screen.findByTestId('trend-Handicap History')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-Strokes Gained History')).not.toBeInTheDocument();
    expect(
      screen.getByText('Complete 1 more round to start seeing your strokes gained history.'),
    ).toBeInTheDocument();
    staggeredView.unmount();

    const completeTrend = {
      ...staggeredTrend,
      labels: [...staggeredTrend.labels, 'Jun 17'],
      handicap: [...staggeredTrend.handicap, 4.0],
      sgTotal: [...staggeredTrend.sgTotal, 0.3],
    };
    const completeInsights = makeInsights(true, { combined: { trend: completeTrend } });
    completeInsights.game_trends = makeGameTrends(true, 6);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: completeInsights }),
    });

    render(<InsightsPage />);
    expect(await screen.findByTestId('trend-Handicap History')).toBeInTheDocument();
    expect(screen.getByTestId('trend-Strokes Gained History')).toBeInTheDocument();
  });

  it('keeps the full-height Strokes Gained trend preview behind the free upgrade CTA', async () => {
    const freeTrend = {
      ...makeModePayload().trend,
      labels: ['Jun 12', 'Jun 13', 'Jun 14', 'Jun 15', 'Jun 16'],
      handicap: [null, null, 4.4, 4.2, 4.1],
      sgTotal: [null, null, null, 0.2, 0.4],
    };
    const insights = makeInsights(false, { combined: { trend: freeTrend } });
    insights.game_trends = makeGameTrends(false, 5);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    expect(await screen.findByTestId('trend-Strokes Gained History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Premium Plans' })).toBeInTheDocument();
    expect(
      screen.queryByText(/more rounds? to start seeing your strokes gained history/i),
    ).not.toBeInTheDocument();
  });

  it('renders the observed profile with baseline-only Recent Form and a contextual Softening Outlook', async () => {
    const insights = makeInsights(true);
    insights.game_trends.recentForm = {
      ...insights.game_trends.recentForm,
      state: 'better_than_established',
      maturity: 'established',
      evidence: {
        ...insights.game_trends.recentForm.evidence,
        recentCount: 5,
        baselineCount: 8,
        averageScore: 92.4,
        baselineAverageScore: 93.9,
        deltaVsBaseline: -1.5,
        momentum: {
          state: 'worsening',
          recentCount: 5,
          comparisonCount: 5,
          recentAverageScore: 92.4,
          comparisonAverageScore: 90.8,
          deltaVsPrevious: 1.6,
        },
      },
    };
    insights.projection_by_mode.combined = {
      ...insights.projection_by_mode.combined,
      trajectory: 'worsening',
      projectedScoreIn10: 92.7,
      scoreLow: 87.7,
      scoreHigh: 97.7,
      projectedHandicapIn10: 17.4,
      handicapLow: 16.4,
      handicapHigh: 18.4,
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    const { container } = render(<InsightsPage />);
    await screen.findByText('Softening');

    const recentForm = container.querySelector('[data-conclusion-type="recent_form"]');
    expect(recentForm).toHaveTextContent('Your recent scoring has been better than your usual level.');
    expect(recentForm).toHaveTextContent('Your latest 5 rounds average 92.4 compared with 93.9 across the previous 8.');
    expect(recentForm).not.toHaveTextContent('five rounds before them');

    const outlook = container.querySelector('.trajectory-card');
    expect(outlook?.querySelector('[data-outlook-status="softening"]')).toHaveTextContent('Softening');
    expect(outlook?.querySelector('.trajectory-momentum-copy')).toBeNull();
    expect(outlook).toHaveTextContent('87-98');
    expect(outlook).toHaveTextContent('16.4-18.4');
    expect(outlook?.querySelector('[data-outlook-status="worsening"]')).toBeNull();
  });

  it('uses clear high-level tooltip copy across Overall Insights', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(true) }),
    });

    const { container } = render(<InsightsPage />);
    await screen.findByText(
      'Combines how your recent scoring compares with your usual level and how your latest five rounds compare with the five before them. Score Range balances recent and usual scoring, and widens when recent rounds are less consistent. Handicap Range uses your recent handicap history.',
    );
    expect(screen.getByText(
      'Shows how your recent scores compare with your usual scoring across the non-overlapping rounds before your recent window. Lower is better.',
    )).toBeInTheDocument();
    expect(screen.getByText(
      'Combines how your recent scoring compares with your usual level and how your latest five rounds compare with the five before them. Score Range balances recent and usual scoring, and widens when recent rounds are less consistent. Handicap Range uses your recent handicap history.',
    )).toBeInTheDocument();
    expect(screen.getByText(
      'Shows how much your score relative to par changes from round to round across your last five rounds. Less variation means more consistent scoring.',
    )).toBeInTheDocument();

    const tooltipTexts = screen.getAllByTestId('info-tooltip').map((tooltip) => tooltip.textContent ?? '');
    expect(tooltipTexts.some((text) => text.startsWith('Shows the percentage of fairways you hit.'))).toBe(true);
    expect(tooltipTexts.some((text) => text.startsWith('Shows the percentage of greens you hit in regulation.'))).toBe(true);
    expect(tooltipTexts.some((text) => text.startsWith('Shows your average chips and greenside bunker shots per round.'))).toBe(true);
    expect(tooltipTexts.some((text) => text.startsWith('Shows your average putts per round.'))).toBe(true);
    expect(tooltipTexts.some((text) => text.startsWith('Shows your average penalties per round.'))).toBe(true);
  });

  it('shows Game Trends confidence tooltip copy', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    render(<InsightsPage />);

    const confidencePill = await screen.findByRole('button', { name: 'Game Trends confidence: Moderate' });
    fireEvent.click(confidencePill);
    expect(screen.getByText('Game Trends Confidence')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Building means an early read. Moderate means useful evidence is forming. Strong means every available conclusion has strong support.',
      ),
    ).toBeInTheDocument();
  });

  it('renders Building/Moderate/Strong aggregate confidence values and tone classes', async () => {
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
    lowInsights.game_trends.confidence = 'building';
    mediumInsights.game_trends.confidence = 'moderate';
    highInsights.game_trends.confidence = 'strong';
    lowInsights.game_trends.stability = {
      ...lowInsights.game_trends.stability,
      state: 'building',
      confidence: 'building',
      evidence: { recentCount: 1, standardDeviation: null, scoreRange: null },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: lowInsights }),
    });
    const lowRender = render(<InsightsPage />);
    const lowPill = await screen.findByRole('button', { name: 'Game Trends confidence: Building' });
    expect(lowPill).toHaveClass('is-low');
    expect(lowRender.container.querySelector('.consistency-badge')).toHaveTextContent('Building');
    expect(screen.queryByText('Not enough data')).not.toBeInTheDocument();
    lowRender.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: mediumInsights }),
    });
    const mediumRender = render(<InsightsPage />);
    const mediumPill = await screen.findByRole('button', { name: 'Game Trends confidence: Moderate' });
    expect(mediumPill).toHaveClass('is-medium');
    mediumRender.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: highInsights }),
    });
    render(<InsightsPage />);
    const highPill = await screen.findByRole('button', { name: 'Game Trends confidence: Strong' });
    expect(highPill).toHaveClass('is-high');
  });

  it('uses backend confidence value when provided', async () => {
    const insights = makeInsights(false);
    insights.game_trends.confidence = 'building';
    insights.mode_payload.combined.kpis.roundsRecent = 6;
    insights.mode_payload.combined.consistency = { label: 'stable', stdDev: 1.2 };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    const pill = await screen.findByRole('button', { name: 'Game Trends confidence: Building' });
    expect(pill).toHaveClass('is-low');
  });

  it('keeps early-sample guidance inside Game Trends instead of rendering a page banner', async () => {
    const lowSample = makeInsights(false, {
      combined: {
        kpis: {
          roundsRecent: 1,
          avgScoreRecent: 90,
          avgScoreBaseline: null,
          avgToParRecent: 18,
          avgSgTotalRecent: null,
          bestScoreRecent: 90,
          deltaVsBaseline: null,
        },
      },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: lowSample }),
    });
    const firstRender = render(<InsightsPage />);
    await screen.findByText('Game Trends');
    expect(
      screen.queryByText('GolfIQ can spot early signals from your first rounds. A few more rounds will make the picture clearer.'),
    ).not.toBeInTheDocument();
    firstRender.unmount();

    const threeRoundSample = makeInsights(false, {
      combined: {
        kpis: {
          roundsRecent: 3,
          avgScoreRecent: 84.2,
          avgScoreBaseline: 84.8,
          avgToParRecent: 12.2,
          avgSgTotalRecent: null,
          bestScoreRecent: 81,
          deltaVsBaseline: -0.6,
        },
      },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: threeRoundSample }),
    });
    render(<InsightsPage />);
    await screen.findByText('Game Trends');
    expect(screen.queryByText('Still early, but a pattern is starting to show.')).not.toBeInTheDocument();
  });

  it('renders 0-round state safely with building confidence and a neutral outlook', async () => {
    const zeroRoundInsights: any = makeInsights(false, {
      combined: {
        kpis: {
          roundsRecent: 0,
          avgScoreRecent: null,
          avgScoreBaseline: null,
          avgToParRecent: null,
          avgSgTotalRecent: null,
          bestScoreRecent: null,
          deltaVsBaseline: null,
        },
        consistency: { label: 'insufficient', stdDev: null },
        efficiency: {
          fir: { recent: null, baseline: null, coverageRecent: '0/5' },
          gir: { recent: null, baseline: null, coverageRecent: '0/5' },
          shortGameShots: { recent: null, baseline: null, coverageRecent: '0/5' },
          puttsTotal: { recent: null, baseline: null, coverageRecent: '0/5' },
          penaltiesPerRound: { recent: null, baseline: null, coverageRecent: '0/5' },
        },
      },
    });
    zeroRoundInsights.cards = [
      'Early read: your score pattern is starting to form. A few more rounds will make this stronger.',
      'The score trend is still forming, and GolfIQ needs more tracked stats to explain it. A few more tracked rounds will sharpen it.',
      'This is still taking shape. A few more rounds will show whether your scores are settling down or bouncing around.',
    ];
    zeroRoundInsights.projection.trajectory = 'unknown';
    zeroRoundInsights.projection_by_mode.combined.trajectory = 'unknown';
    zeroRoundInsights.projection.projectedScoreIn10 = null;
    zeroRoundInsights.projection_by_mode.combined.projectedScoreIn10 = null;
    zeroRoundInsights.game_trends = makeGameTrends(false, 0);
    zeroRoundInsights.generated_at = '2026-02-12T10:00:09.000Z';
    zeroRoundInsights.mode_payload.combined.trend = {
      labels: [],
      score: [],
      firPct: [],
      girPct: [],
      sgTotal: [],
      handicap: [],
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: zeroRoundInsights }),
    });

    const { container } = render(<InsightsPage />);

    await screen.findByText('Add your first round to start building Game Trends.');
    expect(
      screen.queryByText('GolfIQ can spot early signals from your first rounds. A few more rounds will make the picture clearer.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log First Round' })).not.toBeInTheDocument();

    const emptyComparisonCards = container.querySelectorAll(
      '.comparison-bar-card:not(.consistency-card)',
    );
    expect(emptyComparisonCards).toHaveLength(6);
    emptyComparisonCards.forEach((card) => {
      expect(card.querySelectorAll('.comparison-bar-label')).toHaveLength(1);
      expect(card.querySelector('.comparison-bar-label')).toHaveTextContent('Average');
      expect(card.querySelector('.comparison-bar-value')).toHaveTextContent('-');
      expect(card.querySelector('.comparison-bar-track')).toBeInTheDocument();
      expect(card.querySelector('.comparison-bar-fill')).toBeNull();
      expect(card.querySelector('.comparison-bar-delta')).toBeNull();
    });

    expect(screen.getByRole('button', { name: 'Game Trends confidence: Building' })).toBeInTheDocument();
    expect(screen.getByText('Scoring Direction')).toBeInTheDocument();
    expect(screen.getByText('Still Building')).toBeInTheDocument();
    expect(screen.queryByText(/You're losing about/i)).not.toBeInTheDocument();

    let viewedCalls: any[] = [];
    await waitFor(() => {
      viewedCalls = mockedCaptureClientEvent.mock.calls.filter(
        (call) => call[0] === ANALYTICS_EVENTS.insightsViewed,
      );
      expect(viewedCalls.length).toBeGreaterThan(0);
    });
    expect(viewedCalls[0][1]).toEqual(expect.objectContaining({ sample_size: 0 }));
  });

  it('sends insights_viewed analytics with rounds_recent payload key', async () => {
    const insights = makeInsights(false);
    insights.generated_at = '2026-02-12T10:00:01.000Z';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);
    await screen.findByText('Game Trends');

    let viewedCalls: any[] = [];
    await waitFor(() => {
      viewedCalls = mockedCaptureClientEvent.mock.calls.filter(
        (call) => call[0] === ANALYTICS_EVENTS.insightsViewed,
      );
      expect(viewedCalls.length).toBeGreaterThan(0);
    });
    expect(viewedCalls[0][1]).toEqual(
      expect.objectContaining({
        surface: 'overall_insights',
        rounds_recent: 5,
        insight_mode: 'combined',
        mode: 'combined',
        sample_size: 5,
        rounds_lifetime: 20,
      }),
    );
  });

  it('routes free SG trend lock CTA to /pricing and fires upgrade analytics payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights: makeInsights(false) }),
    });

    render(<InsightsPage />);

    const button = await screen.findByRole('button', { name: 'See Premium Plans' });
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

  it('fires paywall_viewed once per visible lock surface and does not duplicate on rerender', async () => {
    const insights = makeInsights(false);
    insights.generated_at = '2026-02-12T10:00:10.000Z';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    await screen.findByText('See what is really costing you strokes');

    const initialPaywallCalls = mockedCaptureClientEvent.mock.calls.filter(
      (call) => call[0] === ANALYTICS_EVENTS.paywallViewed,
    );
    expect(initialPaywallCalls).toHaveLength(3);
    expect(initialPaywallCalls.map((call) => call[1]?.lock_surface).sort()).toEqual(
      ['sg_component_delta', 'sg_trend', 'trajectory'],
    );

    fireEvent.click(screen.getByRole('button', { name: 'Game Trends confidence: Moderate' }));

    await waitFor(() => {
      const afterRerenderPaywallCalls = mockedCaptureClientEvent.mock.calls.filter(
        (call) => call[0] === ANALYTICS_EVENTS.paywallViewed,
      );
      expect(afterRerenderPaywallCalls).toHaveLength(3);
    });
  });

  it('does not fire paywall_viewed for premium users when lock surfaces are not visible', async () => {
    mockedUseSubscription.mockReturnValue({ isPremium: true });
    const insights = makeInsights(true);
    insights.generated_at = '2026-02-12T10:00:11.000Z';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    await screen.findByText('Game Trends');

    const paywallCalls = mockedCaptureClientEvent.mock.calls.filter(
      (call) => call[0] === ANALYTICS_EVENTS.paywallViewed,
    );
    expect(paywallCalls).toHaveLength(0);
  });

  it('captures structured Game Trends conclusions without copy hashes or indices', async () => {
    const insights = makeInsights(false);
    insights.generated_at = '2026-02-12T10:00:12.000Z';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ insights }),
    });

    render(<InsightsPage />);

    await screen.findByText('Game Trends');

    let cardCalls = mockedCaptureClientEvent.mock.calls.filter(
      (call) => call[0] === ANALYTICS_EVENTS.gameTrendConclusionViewed,
    );
    await waitFor(() => {
      cardCalls = mockedCaptureClientEvent.mock.calls.filter(
        (call) => call[0] === ANALYTICS_EVENTS.gameTrendConclusionViewed,
      );
      expect(cardCalls).toHaveLength(4);
    });
    expect(cardCalls[0][1]).toEqual(
      expect.objectContaining({
        surface: 'overall_insights',
        version: 2,
        conclusion_type: 'recent_form',
        momentum_state: 'unavailable',
        outlook_status: 'building',
        mode: 'combined',
        entitlement: 'free',
      }),
    );
    expect(cardCalls.map((call) => call[1]?.conclusion_type)).toEqual([
      'recent_form',
      'strength',
      'opportunity',
      'stability',
    ]);
    cardCalls.forEach((call) => {
      expect(call[1]).not.toHaveProperty('message_hash');
      expect(call[1]).not.toHaveProperty('message_index');
      expect(call[1]).not.toHaveProperty('copy');
    });
  });

  it.each(['flat', 'unknown', undefined] as const)(
    'derives Scoring Direction from canonical Game Trends when internal trajectory is %s',
    async (trajectory) => {
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
      insights.projection_by_mode.combined.trajectory = trajectory as any;

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ insights }),
      });

      render(<InsightsPage />);

      await screen.findByText('Still Building');
      expect(screen.queryByText('Flat')).not.toBeInTheDocument();
      expect(screen.getByText('Still Building')).toBeInTheDocument();
      expect(screen.queryByText('Improving')).not.toBeInTheDocument();
      expect(screen.queryByText('Worsening')).not.toBeInTheDocument();
    },
  );

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
    }, '9');

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

    await screen.findByText('74.0');

    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '9' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/insights/overall?statsMode=9',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    await screen.findByText('39.4');
    expect(screen.getByText('41.0')).toBeInTheDocument();
    expect(screen.getByText('4.2-5.4')).toBeInTheDocument();
  });

  it('uses the native 18-hole handicap range when 18-hole mode is selected', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ insights: makeInsights(true) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ insights: makeInsights(true, undefined, '18') }) });

    render(<InsightsPage />);
    await screen.findByText('2.8-4.6');
    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '18' } });
    await screen.findByText('76.2');
    expect(Array.from(document.querySelectorAll('.trajectory-pill-value')).map((node) => node.textContent?.trim()))
      .toContain('3-4.1');
    expect(screen.queryByText('2.8-4.6')).not.toBeInTheDocument();
  });

  it('does not borrow the Combined handicap range for an unsupported selected mode', async () => {
    const nineInsights = makeInsights(true, undefined, '9');
    (nineInsights.projection_by_mode['9'] as any).projectedHandicapIn10 = null;
    (nineInsights.projection_by_mode['9'] as any).handicapLow = null;
    (nineInsights.projection_by_mode['9'] as any).handicapHigh = null;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ insights: makeInsights(true) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ insights: nineInsights }) });

    render(<InsightsPage />);
    await screen.findByText('2.8-4.6');
    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '9' } });
    await screen.findByText('39.4');
    expect(screen.queryByText('2.8-4.6')).not.toBeInTheDocument();
    expect(screen.getByText('GolfIQ needs a little more handicap history before showing a handicap outlook.')).toBeInTheDocument();
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
    }, '9');

    let rejectCombinedRequest: (reason?: unknown) => void = () => {};
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

    rejectCombinedRequest(new Error('stale insights fetch failed'));

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

    await screen.findByText('74.0');

    fireEvent.change(screen.getByTestId('stats-mode-select'), { target: { value: '9' } });

    await screen.findByText('GolfIQ couldn’t load Game Trends right now. Please try again.');
    expect(screen.queryByText('Insights mode load failed')).not.toBeInTheDocument();
  });
});
