import { DASHBOARD_TREND_CONFIG } from './config';
import type {
  DashboardTrendCategory,
  DashboardTrendResolverInput,
  DashboardTrendResult,
  TrendComponentValue,
  TrendRoundInput,
} from './types';

const CATEGORIES: DashboardTrendCategory[] = [
  'off_the_tee',
  'approach',
  'short_game',
  'putting',
];

type ComponentEvidence = {
  category: DashboardTrendCategory;
  recentValues: number[];
  recentAverage: number | null;
  trackedRecentCount: number;
  negativeRecentCount: number;
  lowestComponentCount: number;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundForComparison(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roundForComparison(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isModeCompatible(round: TrendRoundInput, mode: DashboardTrendResolverInput['mode']): boolean {
  if (mode === '9') return round.holes === 9;
  if (mode === '18') return round.holes === 18;
  return round.holes === 9 || round.holes === 18;
}

function normalizedValue(
  round: TrendRoundInput,
  category: DashboardTrendCategory,
  mode: DashboardTrendResolverInput['mode'],
): number | null {
  if (!isModeCompatible(round, mode)) return null;

  const component: TrendComponentValue = round.components[category];
  if (!component.tracked || component.value == null || !Number.isFinite(component.value)) return null;
  if (category === 'short_game' && !round.shortGameOpportunityEligible) return null;

  return mode === 'combined' && round.holes === 9 ? component.value * 2 : component.value;
}

function buildEvidence(
  recentRounds: TrendRoundInput[],
  mode: DashboardTrendResolverInput['mode'],
): ComponentEvidence[] {
  const evidence = CATEGORIES.map((category) => {
    const recentValues = recentRounds
      .map((round) => normalizedValue(round, category, mode))
      .filter((value): value is number => value != null);

    return {
      category,
      recentValues,
      recentAverage: average(recentValues),
      trackedRecentCount: recentValues.length,
      negativeRecentCount: recentValues.filter((value) => value < 0).length,
      lowestComponentCount: 0,
    };
  });

  const adequatelyTracked = new Set(
    evidence
      .filter((component) => component.trackedRecentCount >= DASHBOARD_TREND_CONFIG.minimumTrackedRecent)
      .map((component) => component.category),
  );

  for (const round of recentRounds) {
    const negativeValues = CATEGORIES
      .filter((category) => adequatelyTracked.has(category))
      .map((category) => ({ category, value: normalizedValue(round, category, mode) }))
      .filter(
        (entry): entry is { category: DashboardTrendCategory; value: number } =>
          entry.value != null && entry.value < 0,
      );

    if (negativeValues.length === 0) continue;
    const lowest = negativeValues.reduce((current, entry) =>
      entry.value < current.value ? entry : current,
    );
    const target = evidence.find((component) => component.category === lowest.category);
    if (target) target.lowestComponentCount += 1;
  }

  return evidence;
}

function baselineForComponent(
  baselineRounds: TrendRoundInput[],
  category: DashboardTrendCategory,
  mode: DashboardTrendResolverInput['mode'],
): { average: number | null; deltaDirectionAvailable: boolean } {
  const values = baselineRounds
    .slice(0, DASHBOARD_TREND_CONFIG.baselineWindowMax)
    .map((round) => normalizedValue(round, category, mode))
    .filter((value): value is number => value != null);

  if (values.length < DASHBOARD_TREND_CONFIG.minimumBaselineTracked) {
    return { average: null, deltaDirectionAvailable: false };
  }

  return { average: average(values), deltaDirectionAvailable: true };
}

function normalizeZero(value: number): number {
  const rounded = roundForComparison(value);
  return rounded === 0 || Object.is(rounded, -0) ? 0 : rounded;
}

export function resolveDashboardTrendFocus(
  input: DashboardTrendResolverInput,
): DashboardTrendResult {
  if (input.recentRounds.length !== DASHBOARD_TREND_CONFIG.recentWindowSize) {
    return {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'fewer_than_five_recent',
    };
  }

  const evidence = buildEvidence(input.recentRounds, input.mode);
  const withAnyTracking = evidence.filter((component) => component.trackedRecentCount > 0);
  if (withAnyTracking.length === 0) {
    return {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'no_eligible_components',
    };
  }

  const adequatelyTracked = evidence.filter(
    (component) => component.trackedRecentCount >= DASHBOARD_TREND_CONFIG.minimumTrackedRecent,
  );
  if (adequatelyTracked.length < DASHBOARD_TREND_CONFIG.minimumAdequatelyTrackedComponents) {
    return {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'insufficient_component_coverage',
    };
  }

  const undercoveredNegativeComponent = evidence.some(
    (component) =>
      component.trackedRecentCount > 0 &&
      component.trackedRecentCount < DASHBOARD_TREND_CONFIG.minimumTrackedRecent &&
      component.recentAverage != null &&
      component.recentAverage < 0,
  );
  if (undercoveredNegativeComponent) {
    return {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'insufficient_component_coverage',
    };
  }

  if (adequatelyTracked.every((component) => (component.recentAverage ?? Number.NEGATIVE_INFINITY) >= 0)) {
    return { kind: 'all_positive', confidence: 'building' };
  }

  const weaknessCandidates = adequatelyTracked
    .filter((component) => component.recentAverage != null)
    .filter(
      (component) =>
        component.negativeRecentCount >= DASHBOARD_TREND_CONFIG.minimumNegativeRecent &&
        (component.recentAverage as number) <= DASHBOARD_TREND_CONFIG.maximumRecentAverageForWeakness,
    )
    .sort((left, right) => (left.recentAverage as number) - (right.recentAverage as number));
  const recurringCandidates = weaknessCandidates.filter(
    (component) => component.lowestComponentCount >= DASHBOARD_TREND_CONFIG.minimumLowestCount,
  );

  if (recurringCandidates.length === 0) {
    return {
      kind: 'insufficient_evidence',
      confidence: 'building',
      reason: 'no_repeated_negative_component',
    };
  }

  const selected = recurringCandidates[0];
  const secondWorst = weaknessCandidates.find(
    (component) => component.category !== selected.category,
  ) ?? null;
  const separation = secondWorst
    ? normalizeZero((secondWorst.recentAverage as number) - (selected.recentAverage as number))
    : Math.abs(selected.recentAverage as number);

  if (secondWorst && separation < DASHBOARD_TREND_CONFIG.minimumModerateSeparation) {
    return {
      kind: 'no_clear_separator',
      confidence: 'building',
      candidates: [selected, secondWorst]
        .filter((component): component is ComponentEvidence => component != null)
        .map((component) => ({
          category: component.category,
          recentAverage: component.recentAverage as number,
        })),
    };
  }

  const baseline = baselineForComponent(input.baselineRounds, selected.category, input.mode);
  const recentAverage = selected.recentAverage as number;
  const baselineAverage = baseline.average;
  const baselineDelta = baseline.deltaDirectionAvailable && baselineAverage != null
    ? normalizeZero(recentAverage - baselineAverage)
    : null;
  const baselineDirection = baselineDelta == null
    ? 'unavailable'
    : baselineDelta <= -DASHBOARD_TREND_CONFIG.baselineMaterialDelta
      ? 'worse'
      : baselineDelta >= DASHBOARD_TREND_CONFIG.baselineMaterialDelta
        ? 'improving'
        : 'stable';
  const reason = baselineDirection === 'worse'
    ? 'negative_declining'
    : baselineDirection === 'improving'
      ? 'negative_improving'
      : baselineDirection === 'stable'
        ? 'negative_stable'
        : 'negative_baseline_unavailable';
  const confidence =
    selected.trackedRecentCount === DASHBOARD_TREND_CONFIG.recentWindowSize &&
    selected.negativeRecentCount >= 4 &&
    recentAverage <= DASHBOARD_TREND_CONFIG.minimumStrongRecentAverage &&
    separation >= DASHBOARD_TREND_CONFIG.minimumStrongSeparation
      ? 'strong'
      : 'moderate';

  return {
    kind: 'component',
    category: selected.category,
    confidence,
    recentAverage,
    baselineAverage,
    baselineDelta,
    trackedRecentCount: selected.trackedRecentCount,
    negativeRecentCount: selected.negativeRecentCount,
    lowestComponentCount: selected.lowestComponentCount,
    separation,
    baselineDirection,
    reason,
  };
}
