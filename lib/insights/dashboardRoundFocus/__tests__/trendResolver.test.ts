import { DASHBOARD_TREND_CONFIG } from '../config';
import { resolveDashboardTrendFocus } from '../trendResolver';
import type {
  DashboardTrendCategory,
  DashboardTrendMode,
  TrendRoundInput,
} from '../types';

type ComponentValues = Record<DashboardTrendCategory, number | null>;

const DEFAULT_VALUES: ComponentValues = {
  off_the_tee: 0.2,
  approach: 0.2,
  short_game: 0.2,
  putting: 0.2,
};

function makeRound(
  id: number,
  values: Partial<ComponentValues> = {},
  options: {
    holes?: 9 | 18;
    untracked?: DashboardTrendCategory[];
    shortGameOpportunityEligible?: boolean;
    residual?: number | null;
    sgPartialAnalysis?: boolean | null;
  } = {},
): TrendRoundInput {
  const merged = { ...DEFAULT_VALUES, ...values };
  const untracked = new Set(options.untracked ?? []);

  return {
    roundId: String(id),
    playedAt: `2026-06-${String(id).padStart(2, '0')}T12:00:00.000Z`,
    holes: options.holes ?? 18,
    components: {
      off_the_tee: { value: merged.off_the_tee, tracked: !untracked.has('off_the_tee') },
      approach: { value: merged.approach, tracked: !untracked.has('approach') },
      short_game: { value: merged.short_game, tracked: !untracked.has('short_game') },
      putting: { value: merged.putting, tracked: !untracked.has('putting') },
    },
    residual: options.residual === undefined
      ? undefined
      : { value: options.residual, tracked: true },
    shortGameOpportunityEligible: options.shortGameOpportunityEligible ?? true,
    sgPartialAnalysis: options.sgPartialAnalysis ?? false,
  };
}

function makeRoundsForCategory(
  category: DashboardTrendCategory,
  values: number[],
  options: Parameters<typeof makeRound>[2] = {},
): TrendRoundInput[] {
  return values.map((value, index) => makeRound(index + 1, { [category]: value }, options));
}

function makeBaseline(
  category: DashboardTrendCategory,
  value: number,
  count: number = DASHBOARD_TREND_CONFIG.minimumBaselineTracked,
  options: Parameters<typeof makeRound>[2] = {},
): TrendRoundInput[] {
  return Array.from({ length: count }, (_, index) =>
    makeRound(index + 20, { [category]: value }, options),
  );
}

function resolve(
  recentRounds: TrendRoundInput[],
  baselineRounds: TrendRoundInput[] = [],
  mode: DashboardTrendMode = '18',
) {
  return resolveDashboardTrendFocus({ recentRounds, baselineRounds, mode });
}

describe('resolveDashboardTrendFocus', () => {
  it('selects a strong repeated Approach trend when unrelated round data is partial', () => {
    const recent = makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5, -0.4]);
    recent[0] = {
      ...recent[0],
      sgPartialAnalysis: true,
    };

    expect(resolve(recent, makeBaseline('approach', -0.2))).toMatchObject({
      kind: 'component',
      category: 'approach',
      confidence: 'strong',
      recentAverage: -0.6,
      baselineAverage: -0.2,
      baselineDelta: -0.4,
      trackedRecentCount: 5,
      negativeRecentCount: 5,
      lowestComponentCount: 5,
      baselineDirection: 'worse',
      reason: 'negative_declining',
    });
  });

  it('selects a moderate repeated Putting trend', () => {
    expect(resolve(makeRoundsForCategory('putting', [-0.6, -0.5, -0.4, 0.1, 0.1]))).toMatchObject({
      kind: 'component',
      category: 'putting',
      confidence: 'moderate',
      recentAverage: -0.26,
      baselineDirection: 'unavailable',
    });
  });

  it('classifies a persistent weakness as baseline-stable', () => {
    expect(resolve(
      makeRoundsForCategory('approach', [-0.5, -0.5, -0.45, -0.4, -0.4]),
      makeBaseline('approach', -0.4),
    )).toMatchObject({
      kind: 'component',
      baselineDirection: 'stable',
      reason: 'negative_stable',
    });
  });

  it('keeps a negative but materially improving weakness eligible', () => {
    expect(resolve(
      makeRoundsForCategory('approach', [-0.4, -0.4, -0.35, -0.3, -0.3]),
      makeBaseline('approach', -0.7),
    )).toMatchObject({
      kind: 'component',
      category: 'approach',
      baselineDirection: 'improving',
      reason: 'negative_improving',
    });
  });

  it('classifies a negative and materially worsening weakness', () => {
    expect(resolve(
      makeRoundsForCategory('approach', [-0.7, -0.6, -0.6, -0.6, -0.5]),
      makeBaseline('approach', -0.2),
    )).toMatchObject({
      kind: 'component',
      baselineDirection: 'worse',
      reason: 'negative_declining',
    });
  });

  it('does not turn a positive but relatively lowest component into a focus', () => {
    const recent = Array.from({ length: 5 }, (_, index) => makeRound(index + 1, {
      approach: 0.05,
      off_the_tee: 0.2,
      short_game: 0.3,
      putting: 0.4,
    }));

    expect(resolve(recent)).toEqual({ kind: 'all_positive', confidence: 'building' });
  });

  it('returns all_positive when every adequately tracked component is positive', () => {
    expect(resolve(Array.from({ length: 5 }, (_, index) => makeRound(index + 1)))).toEqual({
      kind: 'all_positive',
      confidence: 'building',
    });
  });

  it('returns no_clear_separator for two close negative components', () => {
    const recent = Array.from({ length: 5 }, (_, index) => makeRound(index + 1, {
      approach: -0.5,
      putting: -0.4,
    }));

    expect(resolve(recent)).toEqual({
      kind: 'no_clear_separator',
      confidence: 'building',
      candidates: [
        { category: 'approach', recentAverage: -0.5 },
        { category: 'putting', recentAverage: -0.4 },
      ],
    });
  });

  it('rejects fewer than five recent rounds', () => {
    expect(resolve(makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5]))).toEqual({
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'fewer_than_five_recent',
    });
  });

  it('selects an absolute repeated trend with fewer than five baseline values', () => {
    expect(resolve(
      makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5, -0.4]),
      makeBaseline('approach', -0.2, 4),
    )).toMatchObject({
      kind: 'component',
      baselineAverage: null,
      baselineDelta: null,
      baselineDirection: 'unavailable',
      reason: 'negative_baseline_unavailable',
    });
  });

  it('does not select a component tracked only three times', () => {
    const recent = makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5, -0.4]);
    recent[3].components.approach.tracked = false;
    recent[4].components.approach.tracked = false;

    expect(resolve(recent)).toMatchObject({
      kind: 'insufficient_evidence',
      reason: 'insufficient_component_coverage',
    });
  });

  it('does not select a component negative in only two rounds', () => {
    expect(resolve(makeRoundsForCategory('approach', [-1, -0.8, 0.1, 0.1, 0.1]))).toMatchObject({
      kind: 'insufficient_evidence',
      reason: 'no_repeated_negative_component',
    });
  });

  it('does not select a component that is lowest in only one round', () => {
    const approach = [-1, -0.4, -0.4, 0.1, 0.1];
    const putting = [-0.2, -0.5, -0.5, 0.1, 0.1];
    const recent = approach.map((value, index) => makeRound(index + 1, {
      approach: value,
      putting: putting[index],
    }));

    expect(resolve(recent)).toMatchObject({
      kind: 'insufficient_evidence',
      reason: 'no_repeated_negative_component',
    });
  });

  it('does not select a recent average above the weakness threshold', () => {
    expect(resolve(makeRoundsForCategory('approach', [-0.4, -0.3, -0.2, 0, 0]))).toMatchObject({
      kind: 'insufficient_evidence',
      reason: 'no_repeated_negative_component',
    });
  });

  it('requires three adequately tracked non-residual components', () => {
    const recent = makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5, -0.4], {
      untracked: ['short_game', 'putting'],
    });

    expect(resolve(recent)).toEqual({
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'insufficient_component_coverage',
    });
  });

  it('does not select Short Game without enough opportunities', () => {
    const recent = makeRoundsForCategory('short_game', [-1, -0.9, -0.8, -0.7, -0.6], {
      shortGameOpportunityEligible: false,
    });

    expect(resolve(recent)).not.toMatchObject({ kind: 'component', category: 'short_game' });
  });

  it('never selects residual even when it is the most negative value', () => {
    const recent = Array.from({ length: 5 }, (_, index) => makeRound(index + 1, {
      approach: -0.5,
    }, { residual: -5 }));

    expect(resolve(recent)).toMatchObject({ kind: 'component', category: 'approach' });
  });

  it('does not use baseline SG as recent evidence when recent SG is missing', () => {
    const recent = Array.from({ length: 5 }, (_, index) => makeRound(index + 1, {}, {
      untracked: ['off_the_tee', 'approach', 'short_game', 'putting'],
    }));

    expect(resolve(recent, makeBaseline('approach', -1, 15))).toEqual({
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'no_eligible_components',
    });
  });

  it('normalizes native nine-hole values exactly once in combined mode', () => {
    const result = resolve(
      makeRoundsForCategory('approach', [-0.2, -0.2, -0.2, -0.2, -0.2], { holes: 9 }),
      [],
      'combined',
    );

    expect(result).toMatchObject({
      kind: 'component',
      category: 'approach',
      recentAverage: -0.4,
    });
  });

  it('keeps native nine-hole values unchanged in nine-hole mode', () => {
    const result = resolve(
      makeRoundsForCategory('approach', [-0.4, -0.4, -0.4, -0.4, -0.4], { holes: 9 }),
      [],
      '9',
    );

    expect(result).toMatchObject({ kind: 'component', recentAverage: -0.4 });
  });

  it('keeps eighteen-hole values unchanged', () => {
    const result = resolve(
      makeRoundsForCategory('approach', [-0.4, -0.4, -0.4, -0.4, -0.4]),
      [],
      '18',
    );

    expect(result).toMatchObject({ kind: 'component', recentAverage: -0.4 });
  });

  it.each([
    { baseline: -0.2, recent: -0.6, direction: 'worse', reason: 'negative_declining' },
    { baseline: -0.7, recent: -0.35, direction: 'improving', reason: 'negative_improving' },
    { baseline: -0.4, recent: -0.45, direction: 'stable', reason: 'negative_stable' },
    { baseline: -0.2, recent: -0.4, direction: 'worse', reason: 'negative_declining' },
    { baseline: -0.6, recent: -0.4, direction: 'improving', reason: 'negative_improving' },
  ])('uses the correct baseline sign semantics for $direction', ({ baseline, recent, direction, reason }) => {
    expect(resolve(
      makeRoundsForCategory('approach', [recent, recent, recent, recent, recent]),
      makeBaseline('approach', baseline),
    )).toMatchObject({
      kind: 'component',
      baselineDirection: direction,
      reason,
    });
  });

  it('does not mutate either input array or its round values', () => {
    const recent = makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5, -0.4]);
    const baseline = makeBaseline('approach', -0.2);
    const beforeRecent = structuredClone(recent);
    const beforeBaseline = structuredClone(baseline);

    resolve(recent, baseline);

    expect(recent).toEqual(beforeRecent);
    expect(baseline).toEqual(beforeBaseline);
  });

  it('returns the same result for the same inputs', () => {
    const input = {
      recentRounds: makeRoundsForCategory('approach', [-0.8, -0.7, -0.6, -0.5, -0.4]),
      baselineRounds: makeBaseline('approach', -0.2),
      mode: '18' as const,
    };

    expect(resolveDashboardTrendFocus(input)).toEqual(resolveDashboardTrendFocus(input));
  });
});
