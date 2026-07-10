/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoundInsights from '@/components/RoundInsights';
import { useSession } from 'next-auth/react';
import { ROUND_IDENTITY_V1_VERSION } from '@/lib/insights/roundIdentity/types';

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

function identityPayload() {
  return {
    version: ROUND_IDENTITY_V1_VERSION,
    inputHash: 'abc123',
    primaryKey: 'steady_scoring',
    title: 'Steady Scoring Round',
    summary: 'The round was consistent, with limited score swings hole to hole.',
    shapedBy: ['Primary story: Steady Scoring Round.', 'Includes hole-by-hole scoring pattern evidence.'],
    nextRoundFocus: 'Next round, keep this pattern in place and confirm it across another round.',
    modifiers: ['no_damage', 'repeated_bogeys'],
    evidenceLevel: 'hole_by_hole',
    confidence: 'moderate',
    sampleContext: 'first_round',
    tone: 'build',
    entryMode: 'live_round',
    statCompletenessScore: 62,
    displayEvidence: {
      scoreText: '82 (+10)',
      baselineDeltaText: '1.8 strokes better than your recent average of 83.8.',
      strongestArea: {
        area: 'approach',
        label: 'Approach Play',
        valueText: '+1.1 SG approach',
        detailText: 'Greens in regulation: 9/18 (50%).',
      },
      weakestArea: {
        area: 'off_tee',
        label: 'Off The Tee',
        valueText: '-0.6 SG off tee',
        detailText: 'Fairways hit: 4/12 (33%).',
      },
      hbhStory: {
        label: 'Scoring upside with costly holes',
        detailText: 'You had 2 birdies and 2 double-or-worse holes.',
      },
    },
  };
}

function identityInsightsPayload(overrides: Record<string, any> = {}) {
  const baseIdentity = identityPayload();
  return {
    ...payload('HIGH'),
    round_identity_v1: {
      ...baseIdentity,
      ...overrides,
      displayEvidence: {
        ...baseIdentity.displayEvidence,
        ...(overrides.displayEvidence ?? {}),
      },
    },
    round_number: 2,
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

    await screen.findByText('Round Insights');
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

    await screen.findByText('Round Insights');
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

    await screen.findByText('Round Insights');
    expect(screen.getByText('You shot 79 (+9), which is 2.8 strokes better than your recent average of 81.8.')).toBeInTheDocument();
    expect(screen.getByText('Approach was the biggest source of lost strokes.')).toBeInTheDocument();
    expect(screen.getByText('Next round: Play to the center of the green.')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Unlock Your Full Round Breakdown' })).toBeInTheDocument();
    expect(screen.getByText('See the stats behind each insight and how it shaped your round.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Premium Plans' })).toBeInTheDocument();

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

    await screen.findByText('Round Insights');
    expect(screen.queryByRole('heading', { name: 'Unlock Your Full Round Breakdown' })).not.toBeInTheDocument();
    expect(screen.queryByText('See the stats behind each insight and how it shaped your round.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See Premium Plans' })).not.toBeInTheDocument();
  });

  it('keeps free users on basic messages when a composed identity is present', async () => {
    const withIdentity = identityInsightsPayload({
      displayEvidence: {
        strongestArea: {
          area: 'putting',
          label: 'Putting',
          valueText: '+3.9 SG putting',
          detailText: 'Putts: 31 (1.72 per hole).',
        },
      },
    });

    const { container } = render(
      <RoundInsights
        roundId="round-free-basic-identity"
        isPremium={false}
        initialInsightsPayload={withIdentity}
      />,
    );

    expect(await screen.findByText(withIdentity.messages[0])).toBeInTheDocument();
    expect(screen.queryByText(/You shot 82 \(\+10\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/31 putts/i)).not.toBeInTheDocument();
  });

  it('renders composed identity insights as exactly three legacy-style cards when identity is present', async () => {
    const withIdentity = {
      ...payload('HIGH'),
      round_identity_v1: identityPayload(),
      round_number: 1,
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-identity"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 82 \(\+10\)/i);
    const cards = container.querySelectorAll('.insight-message');
    expect(cards.length).toBe(3);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons.length).toBe(3);
    expect(screen.queryByText('Detailed Breakdown')).not.toBeInTheDocument();
    expect(screen.queryByText('You shot 79 (+9), which is 2.8 strokes better than your recent average of 81.8.')).not.toBeInTheDocument();
  });

  it('shows round-progress helper for first and second rounds, and hides it at round three', async () => {
    const firstRoundPayload = { ...identityInsightsPayload(), round_number: 1 };
    const secondRoundPayload = { ...identityInsightsPayload(), round_number: 2 };
    const thirdRoundPayload = { ...identityInsightsPayload(), round_number: 3 };

    const { rerender } = render(
      <RoundInsights
        roundId="round-progress-1"
        isPremium={true}
        initialInsightsPayload={firstRoundPayload}
      />,
    );

    const firstProgress = await screen.findByText(/2 more rounds unlock stronger patterns\./i);
    expect(firstProgress).toHaveClass('round-identity-sample-note');

    rerender(
      <RoundInsights
        roundId="round-progress-2"
        isPremium={true}
        initialInsightsPayload={secondRoundPayload}
      />,
    );
    await screen.findByText(/1 more round unlocks stronger patterns\./i);

    rerender(
      <RoundInsights
        roundId="round-progress-3"
        isPremium={true}
        initialInsightsPayload={thirdRoundPayload}
      />,
    );
    expect(screen.queryByText(/more round/i)).not.toBeInTheDocument();
  });

  it('does not render raw resolver labels in user-facing identity copy', async () => {
    const withIdentity = {
      ...payload('HIGH'),
      round_identity_v1: {
        ...identityPayload(),
        shapedBy: ['Primary story: Steady Scoring Round.', 'Round detail: repeated_bogeys.'],
        modifiers: ['repeated_bogeys', 'putting_conversion_issue'],
      },
      round_number: 1,
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    render(
      <RoundInsights
        roundId="round-identity-no-raw"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 82 \(\+10\)/i);
    expect(screen.queryByText(/Primary story:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Round detail:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/putting_conversion_issue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^MAIN ROUND STORY$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^WHAT WORKED$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^WHAT TO BUILD NEXT ROUND$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^WHAT TO REPEAT NEXT ROUND$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^WHAT TO WATCH NEXT ROUND$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/repeatable pieces/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/promising signal/i)).not.toBeInTheDocument();
  });

  it('does not render bottom confidence sentence when confidence pill exists', async () => {
    const withIdentity = {
      ...payload('HIGH'),
      round_identity_v1: identityPayload(),
      round_number: 2,
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    render(
      <RoundInsights
        roundId="round-identity-confidence"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByRole('button', { name: /Insight confidence: Moderate/i });
    expect(screen.queryByText(/Strong support from this round profile/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Useful signal with current round data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Early signal: confidence grows as this pattern repeats/i)).not.toBeInTheDocument();
  });

  it('uses round identity confidence for the pill when composed insights render', async () => {
    const withIdentity = {
      ...payload('LOW'),
      round_identity_v1: {
        ...identityPayload(),
        confidence: 'strong',
      },
      round_number: 2,
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const pill = render(
      <RoundInsights
        roundId="round-identity-confidence-source"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    const confidencePill = await screen.findByRole('button', { name: /Insight confidence: Strong/i });
    expect(confidencePill).toHaveClass('is-high');
    expect(pill.queryByRole('button', { name: /Insight confidence: Building/i })).not.toBeInTheDocument();
  });

  it('keeps legacy confidence source when identity is missing and fallback renders', async () => {
    const legacyOnly = payload('HIGH');
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: legacyOnly }),
    });

    render(
      <RoundInsights
        roundId="round-legacy-confidence-source"
        isPremium={true}
        initialInsightsPayload={legacyOnly}
      />,
    );

    const confidencePill = await screen.findByRole('button', { name: /Insight confidence: Strong/i });
    expect(confidencePill).toHaveClass('is-high');
  });

  it('shows Building for score-only identity confidence in composed path', async () => {
    const withIdentity = identityInsightsPayload({
      confidence: 'building',
      evidenceLevel: 'score_only',
      primaryKey: 'score_only_baseline',
      tone: 'explain',
      displayEvidence: {
        scoreText: '92 (+20)',
        baselineDeltaText: undefined,
        strongestArea: undefined,
        weakestArea: undefined,
        hbhStory: undefined,
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    render(
      <RoundInsights
        roundId="round-score-only-building-confidence"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    const confidencePill = await screen.findByRole('button', { name: /Insight confidence: Building/i });
    expect(confidencePill).toHaveClass('is-low');
  });

  it('renders legacy insights when identity payload is missing', async () => {
    render(
      <RoundInsights
        roundId="round-legacy-only"
        isPremium={true}
        initialInsightsPayload={payload('MED')}
      />,
    );

    await screen.findByText('You shot 79 (+9), which is 2.8 strokes better than your recent average of 81.8.');
    expect(screen.queryByText('Main Round Story')).not.toBeInTheDocument();
    expect(screen.queryByText('What Worked')).not.toBeInTheDocument();
  });

  it('renders the neutral identity when aggregate stats have no clear separator', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'no_clear_separator',
      title: 'No Clear Separator',
      summary: 'The tracked areas stayed close enough that no single one defined the round.',
      evidenceLevel: 'aggregate_stats',
      tone: 'build',
      sampleContext: 'established',
      modifiers: [],
    });

    const { container } = render(
      <RoundInsights
        roundId="round-no-clear-separator"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    expect(
      await screen.findByText(/tracked areas stayed close enough that no single one defined the round/i),
    ).toBeInTheDocument();
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons[1]).toHaveClass('insight-level-info');
  });

  it('safely falls back when a stored identity contains unknown keys', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'invented_story',
      modifiers: ['one_hole_damage', 'invented_modifier'],
    });

    render(
      <RoundInsights
        roundId="round-invalid-identity-keys"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    expect(await screen.findByText(/tracked stats did not separate enough to define one clear round story/i)).toBeInTheDocument();
  });

  it('maps composed icons for career-best breakthrough with damage-focused watch', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'breakthrough',
      tone: 'repeat',
      sampleContext: 'established',
      modifiers: ['one_hole_damage'],
      displayEvidence: {
        scoreText: '76 (+6)',
        baselineDeltaText: '18.6 strokes better than your recent average of 94.6.',
        strongestArea: {
          area: 'putting',
          label: 'Putting',
          valueText: '+6.9 SG putting',
          detailText: 'Putts: 27 (1.50 per hole).',
        },
        weakestArea: {
          area: 'big_numbers',
          label: 'Concentrated Damage',
          valueText: '2 double-or-worse holes',
          detailText: 'A couple of big holes carried too much of the score.',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-breakthrough"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 76 \(\+6\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-great');
    expect(icons[1]).toHaveClass('insight-level-success');
    expect(icons[2]).toHaveClass('insight-level-warning');
  });

  it('maps M3 to warning when repeat text is explicitly damage-prevention focused', async () => {
    const withIdentity = identityInsightsPayload({
      inputHash: 'h1',
      primaryKey: 'breakthrough',
      tone: 'repeat',
      modifiers: [],
      sampleContext: 'established',
      displayEvidence: {
        scoreText: '76 (+6)',
        baselineDeltaText: '18.6 strokes better than your recent average of 94.6.',
        strongestArea: {
          area: 'putting',
          label: 'Putting',
          valueText: '+6.9 SG putting',
          detailText: 'Putts: 27 (1.50 per hole).',
        },
        weakestArea: {
          area: 'big_numbers',
          label: 'Big Numbers',
          valueText: '2 double-or-worse holes',
          detailText: 'A couple of big holes carried too much of the score.',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-breakthrough-damage-text-warning"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/protect the good holes by keeping the costly ones closer to bogey/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-great');
    expect(icons[1]).toHaveClass('insight-level-success');
    expect(icons[2]).toHaveClass('insight-level-warning');
  });

  it('maps composed icons to warning for penalty-damaged with big-number leak', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'penalty_damaged',
      tone: 'fix',
      modifiers: ['blow_up_stretch'],
      displayEvidence: {
        scoreText: '50 (+15)',
        baselineDeltaText: '5.1 strokes above your recent average of 44.9.',
        weakestArea: {
          area: 'big_numbers',
          label: 'Concentrated Damage',
          valueText: '4 double-or-worse holes',
          detailText: 'Big numbers shaped too much of the final score.',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-penalty-damage"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 50 \(\+15\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-warning');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-warning');
  });

  it.each(['volatile_scoring', 'big_number', 'approach_leak'])(
    'uses a success M1 icon for positive-total-SG %s rounds while preserving coaching icons',
    async (primaryKey) => {
      const withIdentity = identityInsightsPayload({
        primaryKey,
        tone: primaryKey === 'volatile_scoring' ? 'build' : 'fix',
        overallTone: 'success',
        modifiers: ['one_hole_damage'],
        displayEvidence: {
          scoreText: '77 (+7)',
          baselineDeltaText: '5.6 strokes better than your recent average of 82.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+3.9 SG putting',
            detailText: 'Putts: 31 (1.72 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '2 double-or-worse holes',
            detailText: 'A couple of big holes carried too much of the score.',
          },
        },
      });

      const { container } = render(
        <RoundInsights
          roundId={`round-positive-sg-${primaryKey}`}
          isPremium={true}
          initialInsightsPayload={withIdentity}
        />,
      );

      await screen.findByText(/You shot 77 \(\+7\)/i);
      const icons = container.querySelectorAll('.insight-message-icon');
      expect(icons).toHaveLength(3);
      expect(icons[0]).toHaveClass('insight-level-success');
      expect(icons[1]).toHaveClass('insight-level-success');
      expect(icons[2]).toHaveClass(
        primaryKey === 'volatile_scoring' ? 'insight-level-info' : 'insight-level-warning',
      );
    },
  );

  it('rewards a logged score-only round while keeping evidence and coaching informational', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'score_only_baseline',
      tone: 'explain',
      evidenceLevel: 'score_only',
      modifiers: [],
      displayEvidence: {
        scoreText: '92 (+20)',
        strongestArea: undefined,
        weakestArea: undefined,
        hbhStory: undefined,
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-score-only"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 92 \(\+20\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-success');
    expect(icons[1]).toHaveClass('insight-level-info');
    expect(icons[2]).toHaveClass('insight-level-info');
  });

  it('renders final free score-only copy without duplicate next-round wording', async () => {
    const scoreOnlyFreePayload = {
      messages: [
        'You shot 92 (+20).',
        'This result needs at least one optional stat before GolfIQ can explain what shaped the score.',
        'Next round: add a couple of stats, like putts or greens, so GolfIQ can explain what shaped the score.',
      ],
      message_levels: ['warning', 'info', 'info'],
      confidence: 'LOW',
      round_identity_v1: null,
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: scoreOnlyFreePayload }),
    });

    render(
      <RoundInsights
        roundId="round-free-score-only-copy"
        isPremium={false}
        initialInsightsPayload={scoreOnlyFreePayload}
      />,
    );

    await screen.findByText('You shot 92 (+20).');
    expect(screen.getByText('This result needs at least one optional stat before GolfIQ can explain what shaped the score.')).toBeInTheDocument();
    const action = screen.getByText('Next round: add a couple of stats, like putts or greens, so GolfIQ can explain what shaped the score.');
    expect((action.textContent?.toLowerCase().match(/next round/g) ?? [])).toHaveLength(1);
    expect(screen.queryByText(/another tracked area/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strokes gained|\bSG\b/i)).not.toBeInTheDocument();
  });

  it('maps putting-leak M2 icon to warning', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'putting_leak',
      tone: 'fix',
      displayEvidence: {
        scoreText: '88 (+16)',
        weakestArea: {
          area: 'putting',
          label: 'Putting',
          valueText: '-2.1 SG putting',
          detailText: 'Putts: 38 (2.11 per hole).',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-putting-leak"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 88 \(\+16\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-warning');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-info');
  });

  it('maps approach-leak M3 to info for coaching action focus', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'approach_leak',
      tone: 'fix',
      displayEvidence: {
        scoreText: '90 (+18)',
        weakestArea: {
          area: 'approach',
          label: 'Approach',
          valueText: '-1.2 SG approach',
          detailText: 'Greens in regulation: 4/18 (22%).',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-approach-leak"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 90 \(\+18\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-warning');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-info');
  });

  it('renders premium directional evidence only when it supports the selected leak area', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'approach_leak',
      tone: 'fix',
      overallTone: 'warning',
      displayEvidence: {
        weakestArea: {
          area: 'approach',
          label: 'Approach Play',
          valueText: '-1.2 SG approach',
          detailText: 'Greens in regulation: 5/18 (28%).',
        },
        directional: {
          area: 'gir',
          dominantDirection: 'right',
          count: 5,
          totalDirectionalMisses: 6,
          confidence: 'high',
        },
      },
    });

    render(
      <RoundInsights
        roundId="round-premium-directional"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    expect(await screen.findByText(/This round's GIR misses were mostly right \(5\/6\)/i)).toBeInTheDocument();
  });

  it('maps tee-trouble M3 to info for coaching action focus', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'tee_trouble',
      tone: 'fix',
      displayEvidence: {
        scoreText: '89 (+17)',
        weakestArea: {
          area: 'off_tee',
          label: 'Off The Tee',
          valueText: '-1.1 SG off tee',
          detailText: 'Fairways hit: 4/12 (33%).',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-tee-trouble"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 89 \(\+17\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-warning');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-info');
  });

  it('maps short-game-pressure M3 to info for coaching action focus', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'short_game_pressure',
      tone: 'fix',
      displayEvidence: {
        scoreText: '91 (+19)',
        weakestArea: {
          area: 'short_game',
          label: 'Short Game',
          valueText: '-1.0 SG short game',
          detailText: 'Short-game shots: 18.',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-short-game-pressure"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 91 \(\+19\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-warning');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-info');
  });

  it('keeps M3 warning for one-hole big-number damage', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'big_number',
      tone: 'fix',
      modifiers: ['one_hole_damage'],
      displayEvidence: {
        scoreText: '89 (+17)',
        weakestArea: {
          area: 'big_numbers',
          label: 'Big Numbers',
          valueText: 'One double-or-worse hole',
          detailText: 'One hole accounted for 42% of total over-par damage.',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-big-one-hole"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 89 \(\+17\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[2]).toHaveClass('insight-level-warning');
  });

  it('maps breakthrough repeat without damage focus to success on M3', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'breakthrough',
      tone: 'repeat',
      modifiers: [],
      displayEvidence: {
        scoreText: '77 (+5)',
        baselineDeltaText: '9.0 strokes better than your recent average of 86.0.',
        strongestArea: {
          area: 'approach',
          label: 'Approach',
          valueText: '+1.1 SG approach',
          detailText: 'Greens in regulation: 10/18 (56%).',
        },
        weakestArea: undefined,
        hbhStory: undefined,
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-breakthrough-no-damage"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 77 \(\+5\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-great');
    expect(icons[1]).toHaveClass('insight-level-success');
    expect(icons[2]).toHaveClass('insight-level-success');
  });

  it('maps clean-control repeat icons to positive/non-warning', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'clean_control',
      tone: 'repeat',
      modifiers: ['no_damage'],
      displayEvidence: {
        scoreText: '78 (+6)',
        baselineDeltaText: '4.0 strokes better than your recent average of 82.0.',
        strongestArea: {
          area: 'off_tee',
          label: 'Off The Tee',
          valueText: '+0.7 SG off tee',
          detailText: 'Fairways hit: 9/12 (75%).',
        },
        weakestArea: undefined,
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-clean-control"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 78 \(\+6\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-success');
    expect(icons[1]).toHaveClass('insight-level-success');
    expect(icons[2]).not.toHaveClass('insight-level-warning');
  });

  it('maps everything-leaked fix icons to warning', async () => {
    const withIdentity = identityInsightsPayload({
      primaryKey: 'everything_leaked',
      tone: 'fix',
      displayEvidence: {
        scoreText: '94 (+22)',
        weakestArea: {
          area: 'scoring',
          label: 'Scoring',
          valueText: '-4.2 SG total',
          detailText: 'Multiple areas leaked at the same time.',
        },
      },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: withIdentity }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-everything-leaked"
        isPremium={true}
        initialInsightsPayload={withIdentity}
      />,
    );

    await screen.findByText(/You shot 94 \(\+22\)/i);
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-warning');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-warning');
  });

  it('keeps legacy fallback message-level icon mapping unchanged', async () => {
    const legacy = {
      ...payload('MED'),
      messages: ['m1', 'm2', 'm3'],
      message_levels: ['success', 'warning', 'info'],
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: legacy }),
    });

    const { container } = render(
      <RoundInsights
        roundId="round-icon-legacy-mapping"
        isPremium={true}
        initialInsightsPayload={legacy}
      />,
    );

    await screen.findByText('m1');
    const icons = container.querySelectorAll('.insight-message-icon');
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveClass('insight-level-success');
    expect(icons[1]).toHaveClass('insight-level-warning');
    expect(icons[2]).toHaveClass('insight-level-info');
  });
});
