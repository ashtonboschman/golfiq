import { resolveGameTrendsMode } from '../resolve';
import {
  assertFreeGameTrendsCopySafe,
  composeGameProfileFallbackCopy,
  composeProfileConclusionCopy,
  composeRecentFormCopy,
  composeScoringOutlookPresentation,
  composeStabilityCopy,
  projectGameTrendsForViewer,
} from '../presentation';
import type { GameTrendsComponent } from '../types';
import type { TrendEvidenceRound } from '@/lib/insights/trendEvidence';

function makeRound(index: number, overrides: Partial<TrendEvidenceRound> = {}): TrendEvidenceRound {
  const date = new Date(Date.UTC(2026, 6, 15 - index));
  return {
    roundId: String(index + 1),
    date,
    createdAt: new Date(date.getTime() + 60_000),
    holes: 18,
    roundContext: 'real',
    completed: true,
    score: 80 + index,
    toPar: 8 + index,
    sgPartialAnalysis: false,
    shortGameOpportunityEligible: true,
    components: {
      off_the_tee: 0.6,
      approach: 0.1,
      short_game: 0,
      putting: -0.1,
      penalties: -0.7,
    },
    ...overrides,
  };
}

function rounds(count: number, customize?: (round: TrendEvidenceRound, index: number) => TrendEvidenceRound): TrendEvidenceRound[] {
  return Array.from({ length: count }, (_, index) => {
    const round = makeRound(index);
    return customize ? customize(round, index) : round;
  });
}

describe('Game Trends V2 resolver', () => {
  it.each([
    [0, 'unavailable'],
    [1, 'first_round_snapshot'],
    [2, 'early_scoring_level'],
    [3, 'current_form'],
  ] as const)('resolves the %i-round Recent Form state', (count, state) => {
    expect(resolveGameTrendsMode({ rounds: rounds(count), mode: 'combined' }).recentForm.state).toBe(state);
  });

  it('uses latest 2 versus first 2 at four rounds', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(4, (round, index) => ({ ...round, score: [87, 89, 94, 96][index] })),
      mode: '18',
    });
    expect(result.recentForm).toMatchObject({ state: 'early_better', confidence: 'building' });
    expect(result.recentForm.evidence).toMatchObject({ recentCount: 2, baselineCount: 2, averageScore: 88, baselineAverageScore: 95 });
  });

  it('uses latest 3 versus first 2 at five rounds', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(5, (round, index) => ({ ...round, score: [87, 89, 90, 94, 96][index] })),
      mode: '18',
    });
    expect(result.recentForm.state).toBe('early_better');
    expect(result.recentForm.evidence).toMatchObject({ recentCount: 3, baselineCount: 2, baselineAverageScore: 95 });
  });

  it.each([6, 7, 8, 9])('uses a 3 versus 3 early comparison at %i rounds', (count) => {
    const result = resolveGameTrendsMode({
      rounds: rounds(count, (round, index) => ({ ...round, score: index < 3 ? 80 : 84 })),
      mode: '18',
    });
    expect(result.recentForm).toMatchObject({ state: 'early_better', confidence: 'moderate' });
    expect(result.recentForm.evidence).toMatchObject({ recentCount: 3, baselineCount: 3 });
  });

  it('treats exact early and mature thresholds as similar/near', () => {
    const early = resolveGameTrendsMode({
      rounds: rounds(6, (round, index) => ({ ...round, score: index < 3 ? 81.5 : 80 })),
      mode: '18',
    });
    const mature = resolveGameTrendsMode({
      rounds: rounds(10, (round, index) => ({ ...round, score: index < 5 ? 81 : 80 })),
      mode: '18',
    });
    expect(early.recentForm.state).toBe('early_similar');
    expect(mature.recentForm.state).toBe('near_established');
  });

  it.each([[10, 5], [19, 14], [20, 15], [25, 15]] as const)(
    'uses the mature baseline contract at %i rounds',
    (count, baselineCount) => {
      const result = resolveGameTrendsMode({
        rounds: rounds(count, (round, index) => ({ ...round, score: index < 5 ? 80 : 84 })),
        mode: '18',
      });
      expect(result.recentForm.state).toBe('better_than_established');
      expect(result.recentForm.evidence).toMatchObject({ recentCount: 5, baselineCount });
    },
  );

  it('keeps Recent Form primary while adding canonical worsening momentum to its evidence and copy', () => {
    const scores = [86, 90, 94, 95, 97, 82, 86, 90, 96, 100, 98, 99, 100];
    const result = resolveGameTrendsMode({
      rounds: rounds(scores.length, (round, index) => ({ ...round, score: scores[index] })),
      mode: '18',
    });
    const projected = projectGameTrendsForViewer(result, 'free');

    expect(result.recentForm).toMatchObject({
      state: 'better_than_established',
      evidence: {
        recentCount: 5,
        baselineCount: 8,
        averageScore: 92.4,
        baselineAverageScore: 93.9,
        momentum: {
          state: 'worsening',
          recentCount: 5,
          comparisonCount: 5,
          recentAverageScore: 92.4,
          comparisonAverageScore: 90.8,
          deltaVsPrevious: 1.6,
        },
      },
    });
    expect(composeRecentFormCopy(projected)).toEqual({
      conclusion: 'Your recent scoring has been better than your usual level.',
      supporting: 'Your latest 5 rounds average 92.4 compared with 93.9 across the previous 8.',
    });
    expect(composeScoringOutlookPresentation(projected)).toEqual({
      status: 'softening',
      label: 'Softening',
      tone: 'warn',
    });
  });

  it.each([
    ['better_than_established', 'improving', -1, 'improving', 'Improving', 'up'],
    ['better_than_established', 'steady', 0.4, 'holding', 'Holding', 'flat'],
    ['better_than_established', 'worsening', 1.6, 'softening', 'Softening', 'warn'],
    ['near_established', 'improving', -2, 'improving', 'Improving', 'up'],
    ['near_established', 'steady', 0, 'steady', 'Steady', 'flat'],
    ['near_established', 'worsening', 1.6, 'trending_higher', 'Trending Higher', 'warn'],
    ['worse_than_established', 'improving', -1.6, 'recovering', 'Recovering', 'up'],
    ['worse_than_established', 'steady', 0.4, 'steady', 'Steady', 'flat'],
    ['worse_than_established', 'worsening', 2, 'worsening', 'Worsening', 'down'],
  ] as const)(
    'maps %s plus %s to the contextual %s Outlook status',
    (recentFormState, momentumState, delta, status, label, tone) => {
      const base = projectGameTrendsForViewer(resolveGameTrendsMode({
        rounds: rounds(10, (round, index) => ({ ...round, score: index < 5 ? 80 : 84 })),
        mode: '18',
      }), 'free');
      const trends = {
        ...base,
        recentForm: {
          ...base.recentForm,
          state: recentFormState,
          evidence: {
            ...base.recentForm.evidence,
            momentum: {
              ...base.recentForm.evidence.momentum,
              state: momentumState,
              deltaVsPrevious: delta,
            },
          },
        },
      };

      expect(composeScoringOutlookPresentation(trends)).toEqual({ status, label, tone });
    },
  );

  it('projects the same contextual Outlook for Free and Premium viewers', () => {
    const canonical = resolveGameTrendsMode({
      rounds: rounds(10, (round, index) => ({ ...round, score: index < 5 ? 86 : 84 })),
      mode: '18',
    });

    expect(composeScoringOutlookPresentation(projectGameTrendsForViewer(canonical, 'free')))
      .toEqual(composeScoringOutlookPresentation(projectGameTrendsForViewer(canonical, 'premium')));
  });

  it('keeps Outlook building and omits momentum copy before 10 rounds', () => {
    const trends = projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: rounds(9), mode: '18' }), 'free');
    expect(composeScoringOutlookPresentation(trends)).toEqual({
      status: 'building',
      label: 'Still Building',
      tone: 'none',
    });
  });

  it('uses the native 9-hole threshold for canonical momentum', () => {
    const source = rounds(10, (round, index) => ({
      ...round,
      holes: 9,
      score: index < 5 ? 40 : 40.8,
    }));

    expect(resolveGameTrendsMode({ rounds: source, mode: '9' }).recentForm.evidence.momentum)
      .toMatchObject({ state: 'improving', deltaVsPrevious: -0.8 });
    expect(resolveGameTrendsMode({ rounds: source, mode: 'combined' }).recentForm.evidence.momentum)
      .toMatchObject({ state: 'improving', deltaVsPrevious: -1.6 });
  });

  it('uses native 9-hole early thresholds and Combined normalization exactly once', () => {
    const source = rounds(6, (round, index) => ({ ...round, holes: 9, score: index < 3 ? 42.75 : 42, toPar: index < 3 ? 6.75 : 6 }));
    expect(resolveGameTrendsMode({ rounds: source, mode: '9' }).recentForm.state).toBe('early_similar');
    expect(resolveGameTrendsMode({ rounds: source, mode: 'combined' }).recentForm.evidence.averageScore).toBe(85.5);
  });

  it('excludes future, non-real and incomplete rounds and orders same-date rounds deterministically', () => {
    const now = new Date('2026-07-20T12:00:00Z');
    const sameDate = new Date('2026-07-19T12:00:00Z');
    const source = [
      makeRound(0, { roundId: '10', date: sameDate, createdAt: new Date('2026-07-19T13:00:00Z'), score: 70 }),
      makeRound(1, { roundId: '11', date: sameDate, createdAt: new Date('2026-07-19T14:00:00Z'), score: 71 }),
      makeRound(2, { date: new Date('2026-07-21T12:00:00Z') }),
      makeRound(3, { roundContext: 'practice' }),
      makeRound(4, { completed: false }),
    ];
    const result = resolveGameTrendsMode({ rounds: source, mode: '18', now });
    expect(result.recentForm.evidence.latestScore).toBe(71);
    expect(result.recentForm.evidence.recentCount).toBe(2);
  });

  it('creates provisional Strength and Opportunity at three usable rounds', () => {
    const result = resolveGameTrendsMode({ rounds: rounds(3), mode: '18' });
    expect(result.gameProfile).toMatchObject({ state: 'strength_and_opportunity', confidence: 'building' });
    expect(result.gameProfile.strength).toMatchObject({ component: 'off_the_tee', confidence: 'building', maturity: 'provisional' });
    expect(result.gameProfile.opportunity).toMatchObject({ component: 'penalties', confidence: 'building', maturity: 'provisional' });
  });

  it('uses available component values even when unrelated round data is partial', () => {
    const partial = resolveGameTrendsMode({ rounds: rounds(5, (round, index) => ({ ...round, sgPartialAnalysis: index === 0 })), mode: '18' });
    expect(partial.gameProfile.strength?.confidence).toBe('strong');
    expect(partial.gameProfile.opportunity?.confidence).toBe('strong');
  });

  it('keeps incomplete component coverage in Building without naming a component', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(5, (round) => ({
        ...round,
        components: { ...round.components, short_game: null, putting: null },
      })),
      mode: '18',
    });
    expect(result.gameProfile).toMatchObject({
      state: 'building',
      confidence: 'building',
      strength: null,
      opportunity: null,
      buildingReason: 'insufficient_coverage',
    });
  });

  it('does not call a least-negative component a Strength', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(5, (round) => ({ ...round, components: { off_the_tee: -0.1, approach: -0.3, short_game: -0.4, putting: -0.5, penalties: -0.8 } })),
      mode: '18',
    });
    expect(result.gameProfile.strength).toBeNull();
    expect(result.gameProfile.opportunity?.component).toBe('penalties');
  });

  it('returns Balanced for complete close-tied evidence', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(5, (round) => ({ ...round, components: { off_the_tee: 0.1, approach: 0.1, short_game: 0.1, putting: 0.1, penalties: 0.1 } })),
      mode: '18',
    });
    expect(result.gameProfile).toMatchObject({ state: 'balanced', strength: null, opportunity: null });
  });

  it('keeps softening Strength and improving negative Opportunity selected', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(10, (round, index) => ({
        ...round,
        components: {
          off_the_tee: index < 5 ? 0.6 : 1.1,
          approach: 0.1,
          short_game: 0,
          putting: -0.1,
          penalties: index < 5 ? -0.7 : -1.2,
        },
      })),
      mode: '18',
    });
    expect(result.gameProfile.strength).toMatchObject({ component: 'off_the_tee', change: 'softening' });
    expect(result.gameProfile.opportunity).toMatchObject({ component: 'penalties', change: 'improving' });
    const free = projectGameTrendsForViewer(result, 'free');
    const premium = projectGameTrendsForViewer(result, 'premium');
    const copies = [
      composeProfileConclusionCopy(free.gameProfile.strength!, 'strength'),
      composeProfileConclusionCopy(free.gameProfile.opportunity!, 'opportunity'),
      composeProfileConclusionCopy(premium.gameProfile.strength!, 'strength'),
      composeProfileConclusionCopy(premium.gameProfile.opportunity!, 'opportunity'),
    ];
    expect(copies.map((copy) => copy.supporting).join(' ')).not.toMatch(/established level|pattern is easing|separation .* narrowed/i);
    expect(copies[2].supporting).toBe('You averaged +0.6 strokes gained per round over your last 5 tracked rounds.');
    expect(copies[3].supporting).toBe('You lost an average of 0.7 strokes per round over your last 5 tracked rounds.');
  });

  it('requires evidence-backed span for sustained language', () => {
    const result = resolveGameTrendsMode({
      rounds: rounds(20, (round, index) => {
        const date = new Date(Date.UTC(2026, 6, 15 - index * 4));
        return { ...round, date, createdAt: date };
      }),
      mode: '18',
    });
    expect(result.gameProfile.strength?.maturity).toBe('sustained');
    expect(result.gameProfile.opportunity?.maturity).toBe('sustained');
    const copy = composeProfileConclusionCopy(projectGameTrendsForViewer(result, 'free').gameProfile.strength!, 'strength');
    expect(copy.conclusion).toContain('over the last several months');
  });

  it('uses progressive profile wording and does not unlock historical wording from count alone', () => {
    const provisional = projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: rounds(3), mode: '18' }), 'free');
    const established = projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: rounds(10), mode: '18' }), 'free');
    expect(composeProfileConclusionCopy(provisional.gameProfile.strength!, 'strength').conclusion).toContain('emerging');
    expect(composeProfileConclusionCopy(established.gameProfile.strength!, 'strength').conclusion).toContain('consistently');
    expect(composeProfileConclusionCopy(established.gameProfile.strength!, 'strength').conclusion).not.toContain('several months');
  });

  it('uses usable tracked-round denominators in free and Premium profile evidence', () => {
    const canonical = resolveGameTrendsMode({
      rounds: rounds(5, (round, index) => ({
        ...round,
        components: index === 0
          ? { ...round.components, approach: 0.8 }
          : round.components,
      })),
      mode: '18',
    });
    const free = projectGameTrendsForViewer(canonical, 'free');
    const premium = projectGameTrendsForViewer(canonical, 'premium');
    const freeStrength = composeProfileConclusionCopy(free.gameProfile.strength!, 'strength');
    const premiumOpportunity = composeProfileConclusionCopy(premium.gameProfile.opportunity!, 'opportunity');

    expect(freeStrength.supporting).toBe('It ranked as your best-performing area in 4 of 5 tracked rounds.');
    expect(`${freeStrength.conclusion} ${freeStrength.supporting}`).not.toMatch(/strokes gained|\bSG\b/i);
    expect(premiumOpportunity.supporting).toBe('You lost an average of 0.7 strokes per round over your last 5 tracked rounds.');
  });

  it('reports full and provisional tracked recurrence denominators exactly', () => {
    const full = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(5, (round, index) => ({
        ...round,
        components: index === 0
          ? { ...round.components, approach: 0.8 }
          : round.components,
      })),
      mode: '18',
    }), 'free');
    const provisional = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(3, (round, index) => ({
        ...round,
        components: index === 0
          ? { ...round.components, approach: 0.8 }
          : round.components,
      })),
      mode: '18',
    }), 'free');

    expect(composeProfileConclusionCopy(full.gameProfile.strength!, 'strength').supporting)
      .toContain('4 of 5 tracked rounds');
    expect(composeProfileConclusionCopy(provisional.gameProfile.strength!, 'strength').supporting)
      .toContain('2 of 3 tracked rounds');
    expect(composeProfileConclusionCopy(provisional.gameProfile.strength!, 'strength').conclusion)
      .toContain('emerging');
  });

  it('uses golfer-native Recent Form wording without scoring-level or established-play terminology', () => {
    const current = projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: rounds(2), mode: '18' }), 'free');
    const early = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(5, (round, index) => ({ ...round, score: [87, 89, 90, 94, 96][index] })),
      mode: '18',
    }), 'free');
    const mature = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(10, (round, index) => ({ ...round, score: index < 5 ? 80 : 84 })),
      mode: '18',
    }), 'free');

    expect(composeRecentFormCopy(current).conclusion).toBe('Your recent rounds are averaging 80.5 (+8.5).');
    expect(composeRecentFormCopy(early).conclusion).toBe('Your latest scores are better, averaging 88.7 compared with 95.');
    expect(composeRecentFormCopy(mature).conclusion).toBe('Your recent scoring has been better than your usual level.');
    expect([
      composeRecentFormCopy(current),
      composeRecentFormCopy(early),
      composeRecentFormCopy(mature),
    ].map((copy) => `${copy.conclusion} ${copy.supporting ?? ''}`).join(' ')).not.toMatch(/scoring level|established play/i);
  });

  it.each([
    ['off_the_tee', 'Off the Tee'],
    ['approach', 'Approach'],
    ['short_game', 'Short Game'],
    ['putting', 'Putting'],
    ['penalties', 'Penalties'],
  ] as const)('uses the standard %s component name in profile copy', (component, label) => {
    const components: Record<GameTrendsComponent, number> = {
      off_the_tee: 0.1,
      approach: 0.1,
      short_game: 0.1,
      putting: 0.1,
      penalties: 0.1,
      [component]: 0.8,
    };
    const projected = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(5, (round) => ({ ...round, components })),
      mode: '18',
    }), 'free');
    const copy = composeProfileConclusionCopy(projected.gameProfile.strength!, 'strength');

    expect(copy.conclusion).toMatch(new RegExp(`^${label} `));
    if (component === 'penalties') expect(copy.conclusion).toContain('Penalties have been');
  });

  it('uses plain-language Balanced Game and Stability copy', () => {
    const balanced = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(5, (round) => ({
        ...round,
        components: { off_the_tee: 0.1, approach: 0.1, short_game: 0.1, putting: 0.1, penalties: 0.1 },
      })),
      mode: '18',
    }), 'free');
    const building = projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: rounds(2), mode: '18' }), 'free');
    const measured = projectGameTrendsForViewer(resolveGameTrendsMode({
      rounds: rounds(5, (round, index) => ({ ...round, toPar: [0, 2, 4, 6, 8][index] })),
      mode: '18',
    }), 'free');

    expect(composeGameProfileFallbackCopy(balanced)).toEqual({
      conclusion: 'No single part of your game is consistently helping or hurting your scores right now.',
      supporting: 'The differences between your tracked areas have not been consistent enough for one to stand apart.',
    });
    expect(composeStabilityCopy(building)).toEqual({
      conclusion: 'There are not enough rounds yet to measure your scoring consistency.',
      supporting: 'GolfIQ needs 5 recent scores and has 2 so far.',
    });
    expect(composeStabilityCopy(measured).supporting).toBe(
      'Across your last five rounds, your score relative to par was typically within about 2.8 strokes of your recent average, and 8 strokes separated your best and worst rounds.',
    );
    expect(composeStabilityCopy(measured).supporting).not.toMatch(/standard deviation|dispersion/i);

    const singular = {
      ...measured,
      stability: {
        ...measured.stability,
        evidence: { recentCount: 5, standardDeviation: 1, scoreRange: 1 },
      },
    };
    expect(composeStabilityCopy(singular).supporting).toBe(
      'Across your last five rounds, your score relative to par was typically within about 1 stroke of your recent average, and 1 stroke separated your best and worst rounds.',
    );

    const zeroRange = {
      ...measured,
      stability: {
        ...measured.stability,
        evidence: { recentCount: 5, standardDeviation: 0, scoreRange: 0 },
      },
    };
    expect(composeStabilityCopy(zeroRange).supporting).toBe(
      'Across your last five rounds, every score relative to par was the same.',
    );
  });

  it('caps the canonical envelope so older Premium history cannot change core conclusions', () => {
    const core = rounds(20);
    const withOlderHistory = [...core, ...rounds(5, (round, index) => ({
      ...round,
      roundId: `older-${index}`,
      date: new Date(Date.UTC(2025, 0, 5 - index)),
      components: { off_the_tee: -5, approach: -4, short_game: 4, putting: 5, penalties: 3 },
    }))];
    expect(resolveGameTrendsMode({ rounds: withOlderHistory, mode: '18' })).toEqual(
      resolveGameTrendsMode({ rounds: core, mode: '18' }),
    );
  });

  it('projects identical core conclusions while omitting Premium evidence from free', () => {
    const canonical = resolveGameTrendsMode({ rounds: rounds(10), mode: '18' });
    const free = projectGameTrendsForViewer(canonical, 'free');
    const premium = projectGameTrendsForViewer(canonical, 'premium');
    expect(free.gameProfile.state).toBe(premium.gameProfile.state);
    expect(free.gameProfile.strength?.component).toBe(premium.gameProfile.strength?.component);
    expect(free.gameProfile.strength?.evidence.kind).toBe('free_safe');
    expect(premium.gameProfile.strength?.evidence.kind).toBe('premium');
    expect(JSON.stringify(free)).not.toMatch(/recentSgAverage|sgDelta|separation/);
    const copy = composeProfileConclusionCopy(free.gameProfile.strength!, 'strength');
    expect(`${copy.conclusion} ${copy.supporting}`).not.toMatch(/strokes gained|gaining strokes|losing strokes|\bSG\b/i);
    expect(() => assertFreeGameTrendsCopySafe('SG is improving')).toThrow(/restricted terminology/);
  });

  it('classifies Stability from population SD and uses native 9-hole thresholds', () => {
    const scale18 = 3 / Math.sqrt(0.8);
    const atThree = [-scale18, -scale18, 0, scale18, scale18];
    const scale9 = 1.75 / Math.sqrt(0.8);
    const atOneSeventyFive = [-scale9, -scale9, 0, scale9, scale9];
    const variable18 = resolveGameTrendsMode({ rounds: rounds(5, (round, index) => ({ ...round, toPar: atThree[index] })), mode: '18' });
    const variable9 = resolveGameTrendsMode({ rounds: rounds(5, (round, index) => ({ ...round, holes: 9, toPar: atOneSeventyFive[index] })), mode: '9' });
    expect(variable18.stability.state).toBe('variable');
    expect(variable9.stability.state).toBe('variable');
    expect(variable18.stability.evidence.standardDeviation).toBe(3);
  });

  it.each([1, 2, 3, 4])('keeps Stability Building with %i valid scores', (count) => {
    expect(resolveGameTrendsMode({ rounds: rounds(count), mode: '18' }).stability.state).toBe('building');
  });

  it('uses exact volatile Stability boundaries and leaves range as supporting evidence', () => {
    const scale18 = 5 / Math.sqrt(0.8);
    const values18 = [-scale18, -scale18, 0, scale18, scale18];
    const scale9 = 3 / Math.sqrt(0.8);
    const values9 = [-scale9, -scale9, 0, scale9, scale9];
    const volatile18 = resolveGameTrendsMode({ rounds: rounds(5, (round, index) => ({ ...round, toPar: values18[index] })), mode: '18' });
    const volatile9 = resolveGameTrendsMode({ rounds: rounds(5, (round, index) => ({ ...round, holes: 9, toPar: values9[index] })), mode: '9' });
    expect(volatile18.stability).toMatchObject({ state: 'volatile', confidence: 'strong' });
    expect(volatile9.stability).toMatchObject({ state: 'volatile', confidence: 'strong' });
    expect(volatile18.stability.evidence.scoreRange).toBeGreaterThan(0);
  });

  it('aggregates confidence conservatively while allowing a Building row in a Moderate section', () => {
    expect(resolveGameTrendsMode({ rounds: [], mode: '18' }).confidence).toBe('building');
    const early = resolveGameTrendsMode({ rounds: rounds(5), mode: '18' });
    expect(early.recentForm.confidence).toBe('building');
    expect(early.confidence).toBe('moderate');
    expect(resolveGameTrendsMode({ rounds: rounds(20), mode: '18' }).confidence).toBe('strong');
  });
});
