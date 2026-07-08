import type { DashboardRoundFocusDto } from '../types';
import { composeDashboardRoundFocus } from '../presentation';

function makeDto(overrides: Partial<DashboardRoundFocusDto> = {}): DashboardRoundFocusDto {
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
  } as DashboardRoundFocusDto;
}

describe('composeDashboardRoundFocus', () => {
  it.each([
    ['off_the_tee', 'Off The Tee is the clearest scoring focus right now.', 'Prioritize keeping the ball in play off the tee.'],
    ['approach', 'Approach is the clearest scoring focus right now.', 'Choose targets that leave the largest margin for error.'],
    ['short_game', 'Short Game is the clearest scoring focus right now.', 'Choose the simplest shot that gets the ball safely onto the green.'],
    ['putting', 'Putting is the clearest scoring focus right now.', 'Prioritize pace control and leave manageable second putts.'],
  ] as const)('composes a complete %s trend headline and category-safe action', (category, headline, nextRoundAction) => {
    expect(composeDashboardRoundFocus(makeDto({ selectedCategory: category }))).toMatchObject({
      state: 'ready',
      headline,
      supportingText: 'It has been the most consistent area holding back your recent scoring.',
      nextRoundAction,
    });
  });

  it('composes concise reinforced same-category copy', () => {
    expect(composeDashboardRoundFocus(makeDto({
      relationship: 'reinforced_by_latest_round',
      latestRoundCategory: 'approach',
      latestRoundPolarity: 'weakness',
    }))).toMatchObject({
      headline: 'Approach is the clearest scoring focus right now.',
      supportingText: 'Your latest round showed the same pattern.',
      tone: 'warning',
    });
  });

  it('composes balanced improvement wording for a same-category latest-round strength', () => {
    expect(composeDashboardRoundFocus(makeDto({
      relationship: 'latest_round_improved_against_trend',
      latestRoundCategory: 'approach',
      latestRoundPolarity: 'strength',
    }))).toMatchObject({
      headline: 'Approach is the clearest scoring focus right now.',
      supportingText: 'It was stronger in your latest round, but the broader pattern still deserves attention.',
      tone: 'info',
    });
  });

  it('composes concise same-category inconclusive wording', () => {
    expect(composeDashboardRoundFocus(makeDto({
      relationship: 'latest_round_inconclusive_same_category',
      latestRoundCategory: 'approach',
      latestRoundPolarity: 'neutral',
    }))).toMatchObject({
      headline: 'Approach is the clearest scoring focus right now.',
      supportingText: 'Your latest round did not clearly confirm or reverse that pattern.',
      tone: 'info',
    });
  });

  it('keeps a different-category weakness subordinate to the selected trend', () => {
    expect(composeDashboardRoundFocus(makeDto({
      selectedCategory: 'short_game',
      relationship: 'latest_round_conflicts',
      latestRoundCategory: 'penalties',
      latestRoundPolarity: 'weakness',
    }))).toMatchObject({
      category: 'short_game',
      headline: 'Short Game is the clearest scoring focus right now.',
      supportingText: 'Your latest round pointed more toward penalties, but short game has been the more consistent pattern.',
      nextRoundAction: 'Choose the simplest shot that gets the ball safely onto the green.',
    });
  });

  it('uses selected-category actions for supported latest-round fallbacks', () => {
    expect(composeDashboardRoundFocus(makeDto({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      selectedCategory: 'penalties',
      trendState: 'no_clear_separator',
      baselineDirection: null,
      latestRoundCategory: 'penalties',
      latestRoundPolarity: 'weakness',
      latestRoundUnavailableReason: null,
    }))).toMatchObject({
      headline: 'Keeping penalties off the card is the clearest focus from your latest round.',
      nextRoundAction: 'Prioritize keeping penalty trouble out of play.',
      tone: 'warning',
    });
  });

  it.each([
    ['penalties', 'Prioritize keeping penalty trouble out of play.'],
    ['big_numbers', 'After a mistake, choose the shot that gets the hole back under control.'],
    ['volatility', 'Keep the plan simple and avoid compounding mistakes.'],
  ] as const)('centralizes a safe action for %s', (category, nextRoundAction) => {
    expect(composeDashboardRoundFocus(makeDto({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      selectedCategory: category,
      trendState: 'no_clear_separator',
      baselineDirection: null,
      latestRoundCategory: category,
      latestRoundPolarity: 'weakness',
      latestRoundUnavailableReason: null,
    })).nextRoundAction).toBe(nextRoundAction);
  });

  it('omits advice when no supported category action exists', () => {
    expect(composeDashboardRoundFocus(makeDto({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      selectedCategory: 'all_around',
      trendState: 'no_clear_separator',
      baselineDirection: null,
      latestRoundCategory: 'all_around',
      latestRoundPolarity: 'strength',
      latestRoundUnavailableReason: null,
    })).nextRoundAction).toBeUndefined();
  });

  it('presents the same coaching hierarchy to free and Premium users', () => {
    const free = composeDashboardRoundFocus(makeDto());
    const premium = composeDashboardRoundFocus(makeDto({
      tier: 'premium',
      evidence: {
        recentAverage: -0.7,
        baselineAverage: -0.3,
        baselineDelta: -0.4,
        trackedRecentCount: 5,
        negativeRecentCount: 5,
        lowestComponentCount: 4,
        separation: 0.3,
      },
    }));
    expect(premium).toEqual(free);
  });

  it.each([
    ['all_positive', null, 'No single area stands out as a weakness across your recent rounds.', 'Your recent play has been balanced, so there is no need to force a single focus yet.', 'ready', 'success'],
    ['no_clear_separator', null, 'Your recent rounds are balanced enough that no single focus stands out yet.', 'Keep tracking complete rounds and GolfIQ will surface a focus when one separates clearly.', 'building', 'info'],
    ['insufficient_evidence', 'fewer_than_five_recent', 'Keep logging rounds to build a reliable recent focus.', undefined, 'building', 'info'],
    ['insufficient_evidence', 'insufficient_component_coverage', 'Track a few more complete rounds to identify a reliable focus.', 'More complete stat tracking will help GolfIQ separate the areas of your game.', 'building', 'info'],
    ['insufficient_evidence', 'no_eligible_components', 'Track a few more complete rounds to identify a reliable focus.', 'More complete stat tracking will help GolfIQ separate the areas of your game.', 'building', 'info'],
  ] as const)('does not manufacture a focus or action for %s / %s', (trendState, trendReason, headline, supportingText, state, tone) => {
    const result = composeDashboardRoundFocus(makeDto({
      source: 'neutral',
      relationship: 'no_supported_focus',
      selectedCategory: null,
      confidence: 'building',
      trendState,
      baselineDirection: null,
      trendReason,
    }));
    expect(result).toMatchObject({ state, headline, confidenceLabel: 'Building', tone });
    expect(result.supportingText).toBe(supportingText);
    expect(result.nextRoundAction).toBeUndefined();
  });

  it('returns a safe unavailable presentation when the payload is missing', () => {
    expect(composeDashboardRoundFocus(null)).toMatchObject({
      state: 'unavailable',
      headline: 'There is not enough consistent evidence to name one focus yet.',
      confidenceLabel: 'Building',
      tone: 'info',
    });
  });

  it('does not expose compact-card source or numeric evidence fields for any tier', () => {
    const result = composeDashboardRoundFocus(makeDto({
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
    }));
    expect(result).not.toHaveProperty('sourceLabel');
    expect(result).not.toHaveProperty('evidenceText');
    expect(JSON.stringify(result)).not.toMatch(/Recent:|SG|Recent 5 Rounds/);
  });

  it('never exposes raw keys, resolver names, or unsupported diagnoses', () => {
    const outputs = [
      composeDashboardRoundFocus(makeDto({ selectedCategory: 'off_the_tee' })),
      composeDashboardRoundFocus(makeDto({
        relationship: 'latest_round_conflicts',
        latestRoundCategory: 'big_numbers',
        latestRoundPolarity: 'weakness',
      })),
    ];
    const text = outputs
      .flatMap((output) => [output.headline, output.supportingText, output.nextRoundAction])
      .filter(Boolean)
      .join(' ');
    expect(text).not.toMatch(/off_the_tee|latest_round_conflicts|negative_baseline_unavailable|no_clear_separator/);
    expect(text).not.toMatch(/technique|mindset|rhythm|club choice|start line|decision-making/i);
  });

  it('keeps every text field within the mobile copy budget', () => {
    const result = composeDashboardRoundFocus(makeDto({
      relationship: 'latest_round_conflicts',
      latestRoundCategory: 'scoring_control',
      latestRoundPolarity: 'strength',
    }));
    for (const value of [result.headline, result.supportingText, result.nextRoundAction]) {
      expect(value?.length ?? 0).toBeLessThanOrEqual(220);
    }
  });

  it.each([
    ['off_the_tee', 'Your latest round points to off-the-tee play as the clearest area to address next.', undefined],
    ['approach', 'Your latest round points to approach play as the clearest area to address next.', undefined],
    ['short_game', 'Your latest round points to short-game play as the clearest area to address next.', undefined],
    ['putting', 'Your latest round points to putting as the clearest area to address next.', undefined],
    ['penalties', 'Keeping penalties off the card is the clearest focus from your latest round.', undefined],
    ['big_numbers', 'Avoiding big numbers is the clearest focus from your latest round.', undefined],
    ['volatility', 'Improving scoring consistency is the clearest focus from your latest round.', undefined],
    ['all_around', 'Your latest round points to all-around play as the clearest area to address next.', 'Several areas contributed, rather than one clear weakness defining the round.'],
  ] as const)('uses approved %s weakness fallback copy', (category, headline, supportingText) => {
    const result = composeDashboardRoundFocus(makeDto({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      selectedCategory: category,
      confidence: 'moderate',
      trendState: 'insufficient_evidence',
      baselineDirection: null,
      latestRoundCategory: category,
      latestRoundPolarity: 'weakness',
      latestRoundUnavailableReason: null,
      trendReason: 'no_repeated_negative_component',
    }));
    expect(result.headline).toBe(headline);
    expect(result.supportingText).toBe(supportingText);
    expect(result.headline).not.toMatch(/carry forward/i);
  });

  it.each([
    ['off_the_tee', 'Your latest round showed strong off-the-tee play. Carry that same pattern into the next one.', undefined, 'Prioritize keeping the ball in play off the tee.'],
    ['approach', 'Your latest round showed strong approach play. Carry that same pattern into the next one.', undefined, 'Choose targets that leave the largest margin for error.'],
    ['short_game', 'Your latest round showed strong short-game play. Carry that same pattern into the next one.', undefined, 'Choose the simplest shot that gets the ball safely onto the green.'],
    ['putting', 'Your latest round showed strong putting. Carry that same pattern into the next one.', undefined, 'Prioritize pace control and leave manageable second putts.'],
    ['scoring_control', 'Your latest round showed strong scoring control. Carry that same pattern into the next one.', undefined, 'Carry the same controlled scoring pattern into the next one.'],
    ['all_around', 'Your latest round showed strong all-around play.', 'Carry that same balanced pattern into the next one.', undefined],
  ] as const)('uses reinforcement-oriented %s strength fallback copy', (category, headline, supportingText, nextRoundAction) => {
    const result = composeDashboardRoundFocus(makeDto({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      selectedCategory: category,
      confidence: 'strong',
      trendState: 'all_positive',
      baselineDirection: null,
      latestRoundCategory: category,
      latestRoundPolarity: 'strength',
      latestRoundUnavailableReason: null,
      trendReason: 'all_positive',
    }));
    expect(result).toMatchObject({ headline, nextRoundAction });
    expect(result.supportingText).toBe(supportingText);
  });

  it('omits corrective advice for a neutral Scoring Control fallback', () => {
    expect(composeDashboardRoundFocus(makeDto({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
      selectedCategory: 'scoring_control',
      confidence: 'moderate',
      trendState: 'no_clear_separator',
      baselineDirection: null,
      latestRoundCategory: 'scoring_control',
      latestRoundPolarity: 'neutral',
      latestRoundUnavailableReason: null,
      trendReason: 'no_clear_separator',
    }))).toEqual(expect.objectContaining({
      headline: 'Scoring control is the clearest takeaway from your latest round.',
      supportingText: 'No single tracked area stood out enough to support a more specific recommendation.',
      nextRoundAction: undefined,
    }));
  });

  it.each([
    ['scoring_control', 'neutral', 'Your latest round pointed more toward scoring control, but approach has been the more consistent pattern.'],
    ['scoring_control', 'strength', 'Your latest round showed stronger scoring control, but approach has been the more consistent pattern.'],
    ['all_around', 'weakness', 'Your latest round pointed more toward all-around play, but approach has been the more consistent pattern.'],
    ['all_around', 'strength', 'Your latest round showed stronger all-around play, but approach has been the more consistent pattern.'],
    ['volatility', 'weakness', 'Your latest round pointed more toward scoring consistency, but approach has been the broader recurring pattern.'],
    ['volatility', 'strength', 'Your latest round showed better scoring consistency, but approach has been the broader recurring pattern.'],
    ['putting', 'strength', 'Your latest round showed stronger putting, but approach has been the more consistent pattern.'],
  ] as const)('uses golfer-native conflict copy for %s / %s', (latestRoundCategory, latestRoundPolarity, supportingText) => {
    const result = composeDashboardRoundFocus(makeDto({
      relationship: 'latest_round_conflicts',
      latestRoundCategory,
      latestRoundPolarity,
      latestRoundUnavailableReason: null,
    }));
    expect(result).toMatchObject({
      headline: 'Approach is the clearest scoring focus right now.',
      supportingText,
      nextRoundAction: 'Choose targets that leave the largest margin for error.',
    });
    expect(result.supportingText).not.toMatch(/stronger in overall game|pointed more toward scoring,|scoring consistency.*more consistent pattern/i);
  });

  it.each([
    ['invalid category', { ...makeDto(), selectedCategory: 'mental_game' }],
    ['invalid source', { ...makeDto(), source: 'historic' }],
    ['invalid relationship', { ...makeDto(), relationship: 'maybe_related' }],
    ['invalid polarity', { ...makeDto(), latestRoundPolarity: 'mixed' }],
    ['invalid confidence', { ...makeDto(), confidence: 'certain' }],
    ['invalid trend state', { ...makeDto(), trendState: 'unknown' }],
    ['invalid baseline direction', { ...makeDto(), baselineDirection: 'declining' }],
    ['missing required fields', { version: 'dashboard_round_focus_v2' }],
    ['malformed latest-round category', { ...makeDto(), latestRoundCategory: { category: 'putting' } }],
    ['unknown object', { hello: 'world' }],
    ['array payload', [makeDto()]],
    ['null payload', null],
  ])('returns safe unavailable copy without throwing for %s', (_label, payload) => {
    expect(() => composeDashboardRoundFocus(payload as any)).not.toThrow();
    expect(composeDashboardRoundFocus(payload as any)).toEqual({
      state: 'unavailable',
      headline: 'There is not enough consistent evidence to name one focus yet.',
      confidenceLabel: 'Building',
      tone: 'info',
    });
  });

  it('is deterministic and does not mutate its input', () => {
    const input = makeDto({ latestRoundCategory: 'putting', latestRoundPolarity: 'weakness' });
    const snapshot = structuredClone(input);
    expect(composeDashboardRoundFocus(input)).toEqual(composeDashboardRoundFocus(input));
    expect(input).toEqual(snapshot);
  });
});
