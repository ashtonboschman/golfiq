import {
  type StatsMode,
} from '@/lib/insights/overall';

export type DashboardFocusComponent =
  | 'offTee'
  | 'approach'
  | 'putting'
  | 'penalties'
  | 'residual';
export type DashboardFocusConfidence = 'high' | 'medium' | 'low' | null;
export type RoundFocusOutcome =
  | 'locked'
  | 'score_only_stable'
  | 'score_only_improving'
  | 'score_only_worsening'
  | 'component_opportunity'
  | 'component_strength'
  | 'component_balanced';
export type RoundFocusLockedReason =
  | 'not_enough_rounds'
  | 'missing_summary'
  | 'missing_score_trend'
  | 'insufficient_combined_signal';

export type DashboardOverallInsightsSummary = {
  lastUpdatedAt: string | null;
  drillSeed: string | null;
  recommendationText: string | null;
  mode: StatsMode;
  roundsRecent: number;
  recentWindow: number;
  scoreTrendDelta: number | null;
  trajectoryLabel: 'Improving' | 'Stable' | 'Worsening' | 'Volatile' | 'Unknown';
  consistencyLabel: 'Stable' | 'Moderate' | 'Volatile' | 'Insufficient';
  consistencySpread: number | null;
  projectionScore: number | null;
  projectionScoreRange: {
    low: number | null;
    high: number | null;
  } | null;
  projectionHandicap: number | null;
  sgComponentDelta: {
    offTee: number | null;
    approach: number | null;
    putting: number | null;
    penalties: number | null;
    residual: number | null;
  } | null;
  efficiencyDelta: {
    firPctPoints: number | null;
    girPctPoints: number | null;
    putts: number | null;
    penalties: number | null;
  } | null;
  statCoverage: {
    fir: { tracked: number; total: number };
    gir: { tracked: number; total: number };
    putts: { tracked: number; total: number };
    penalties: { tracked: number; total: number };
  } | null;
  biggestLeakComponent: DashboardFocusComponent | null;
  confidence: DashboardFocusConfidence;
  dataQualityFlags: {
    insufficientRounds: boolean;
    missingScoreTrend: boolean;
    combinedNeedsMoreNineHoleRounds: boolean;
    missingComponentData: boolean;
    partialRecentStats: boolean;
    residualDominant: boolean;
    volatileScoring: boolean;
  };
};

export type RoundFocusPayload = {
  outcome: Exclude<RoundFocusOutcome, 'locked'>;
  focusType: 'score' | 'component';
  headline: string;
  body: string;
  nextRound: string;
  component: DashboardFocusComponent | null;
  confidence: DashboardFocusConfidence;
};

export type RoundFocusState =
  | {
      kind: 'NEED_MORE_ROUNDS';
      outcome: 'locked';
      lockedReason: RoundFocusLockedReason;
      roundsLogged: number;
      minRounds: number;
    }
  | { kind: 'READY_PREMIUM'; focus: RoundFocusPayload }
  | { kind: 'READY_FREE'; focus: RoundFocusPayload; isLimited: boolean };

const VOLATILE_STDDEV_THRESHOLD = 4;
const LEAK_TIE_THRESHOLD = 0.1;
const ROUNDING_FACTOR = 10;
const RESIDUAL_DOMINANT_THRESHOLD = 0.3;
const RESIDUAL_OTHER_COMPONENT_MAX = 0.15;
const MIN_ROUNDS_FOR_TRENDS = 5;

const SG_TIE_BREAK_ORDER: DashboardFocusComponent[] = [
  'penalties',
  'putting',
  'approach',
  'offTee',
];

type SgFocusMode = 'opportunity' | 'strength' | 'balanced';
type SelectedSgFocus = {
  mode: SgFocusMode;
  component: Exclude<DashboardFocusComponent, 'residual'> | null;
  sgDelta: number | null;
};

const SG_OPPORTUNITY_THRESHOLD = -0.15;
const SG_STRENGTH_THRESHOLD = 0.15;
const SG_OPPORTUNITY_SEPARATION_THRESHOLD = 0.03;
const SG_THRESHOLD_EPSILON = 0.000001;
const MAX_NEXT_ROUND_RECOMMENDATION_LENGTH = 64;
const MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS = 3;
const MIN_MEASURED_COMPONENTS_FOR_COMPONENT_FOCUS = 3;

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundOne(value: number | null): number | null {
  if (value == null) return null;
  const rounded = Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;
  return rounded === 0 || Object.is(rounded, -0) ? 0 : rounded;
}

function deltaOrNull(recentRaw: unknown, baselineRaw: unknown): number | null {
  const recent = toNumberOrNull(recentRaw);
  const baseline = toNumberOrNull(baselineRaw);
  if (recent == null || baseline == null) return null;
  return recent - baseline;
}

function formatOneDecimal(value: number): string {
  return (Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR).toFixed(1);
}

function formatApproxSg(value: number): string {
  return `~${formatOneDecimal(Math.abs(value))}`;
}

function scoreNearThreshold(mode: StatsMode): number {
  return mode === '9' ? 0.5 : 1.0;
}

function classifyTrajectoryLabelFromScoring(args: {
  mode: StatsMode;
  roundsRecent: number;
  avgScoreRecentRaw: unknown;
  avgScoreBaselineRaw: unknown;
  deltaFallbackRaw: unknown;
}): DashboardOverallInsightsSummary['trajectoryLabel'] {
  if (args.roundsRecent <= 0) return 'Unknown';

  const avgScoreRecent = toNumberOrNull(args.avgScoreRecentRaw);
  const avgScoreBaseline = toNumberOrNull(args.avgScoreBaselineRaw);
  const deltaFromScores =
    avgScoreRecent != null && avgScoreBaseline != null
      ? avgScoreRecent - avgScoreBaseline
      : null;
  const delta = deltaFromScores ?? toNumberOrNull(args.deltaFallbackRaw);
  if (delta == null) return 'Unknown';

  const threshold = scoreNearThreshold(args.mode);
  if (Math.abs(delta) <= threshold) return 'Stable';
  return delta < 0 ? 'Improving' : 'Worsening';
}

function normalizeConsistencyLabel(raw: unknown): DashboardOverallInsightsSummary['consistencyLabel'] {
  if (raw === 'stable') return 'Stable';
  if (raw === 'moderate') return 'Moderate';
  if (raw === 'volatile') return 'Volatile';
  return 'Insufficient';
}

function normalizeConfidence(raw: unknown): DashboardFocusConfidence {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return null;
}

function parseCoverage(
  raw: unknown,
  fallbackTracked: number,
  fallbackTotal: number,
): { tracked: number; total: number } {
  if (typeof raw === 'string') {
    const match = raw.trim().match(/^(\d+)\/(\d+)$/);
    if (match) {
      return {
        tracked: Number(match[1]),
        total: Number(match[2]),
      };
    }
  }

  return {
    tracked: Math.max(0, Math.floor(fallbackTracked)),
    total: Math.max(0, Math.floor(fallbackTotal)),
  };
}

function statList(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function sanitizeRecommendationText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed
    .replace(/^Priority first:\s*/i, '')
    .replace(/^On-course strategy:\s*/i, '')
    .replace(/^Next round focus:\s*/i, '')
    .trim();

  return withoutPrefix || null;
}

function pickRecommendationText(payload: Record<string, any>, mode: StatsMode): string | null {
  const modeCards = payload.cards_by_mode?.[mode];
  const sharedCards = payload.cards;
  const candidates = [
    Array.isArray(modeCards) ? modeCards[3] : null,
    Array.isArray(modeCards) ? modeCards[4] : null,
    Array.isArray(sharedCards) ? sharedCards[3] : null,
    Array.isArray(sharedCards) ? sharedCards[4] : null,
  ];

  for (const candidate of candidates) {
    const cleaned = sanitizeRecommendationText(candidate);
    if (cleaned) return cleaned;
  }

  return null;
}

function pickBiggestLeakComponent(
  deltas: DashboardOverallInsightsSummary['sgComponentDelta'],
): DashboardFocusComponent | null {
  if (!deltas) return null;
  const candidates = SG_TIE_BREAK_ORDER
    .map((component) => ({ component, value: deltas[component] }))
    .filter((item) => item.value != null && Number.isFinite(item.value))
    .filter((item) => (item.value as number) < 0);

  if (candidates.length === 0) return null;

  let worst = candidates[0];
  for (let idx = 1; idx < candidates.length; idx += 1) {
    const current = candidates[idx];
    const worstValue = worst.value as number;
    const currentValue = current.value as number;
    if (currentValue < worstValue - LEAK_TIE_THRESHOLD) {
      worst = current;
      continue;
    }
    const withinTieBand = Math.abs(currentValue - worstValue) <= LEAK_TIE_THRESHOLD;
    if (withinTieBand) {
      const currentPriority = SG_TIE_BREAK_ORDER.indexOf(current.component);
      const worstPriority = SG_TIE_BREAK_ORDER.indexOf(worst.component);
      if (currentPriority < worstPriority) worst = current;
    }
  }

  return worst.component;
}

function isResidualDominant(
  deltas: DashboardOverallInsightsSummary['sgComponentDelta'],
): boolean {
  if (!deltas) return false;
  if (deltas.residual == null || !Number.isFinite(deltas.residual)) return false;
  const residualAbs = Math.abs(deltas.residual);
  if (residualAbs < RESIDUAL_DOMINANT_THRESHOLD) return false;

  const others = [deltas.offTee, deltas.approach, deltas.putting, deltas.penalties]
    .filter((value): value is number => value != null && Number.isFinite(value))
    .map((value) => Math.abs(value));
  if (others.length === 0) return true;
  return Math.max(...others) <= RESIDUAL_OTHER_COMPONENT_MAX;
}

function hasAnyMeasuredComponentData(deltas: DashboardOverallInsightsSummary['sgComponentDelta']): boolean {
  if (!deltas) return false;
  return [deltas.offTee, deltas.approach, deltas.putting, deltas.penalties].some(
    (value) => value != null && Number.isFinite(value),
  );
}

function componentDisplayName(component: DashboardFocusComponent): string {
  if (component === 'offTee') return 'Off the Tee';
  if (component === 'approach') return 'Approach';
  if (component === 'putting') return 'Putting';
  if (component === 'penalties') return 'Penalties';
  return 'Residual';
}

function componentHeadlineName(component: Exclude<DashboardFocusComponent, 'residual'>): string {
  if (component === 'penalties') return 'Penalty avoidance';
  return componentDisplayName(component);
}

function getLockedReason(summary: DashboardOverallInsightsSummary | null): RoundFocusLockedReason | null {
  if (!summary) return 'missing_summary';
  if (summary.dataQualityFlags.insufficientRounds) return 'not_enough_rounds';
  if (summary.dataQualityFlags.missingScoreTrend) return 'missing_score_trend';
  if (summary.dataQualityFlags.combinedNeedsMoreNineHoleRounds) {
    return 'insufficient_combined_signal';
  }
  return null;
}

function fallbackNextRoundNudge(
  component: Exclude<DashboardFocusComponent, 'residual'> | null,
  mode: SgFocusMode | 'no_data',
): string {
  if (mode === 'no_data') return 'Keep tracking rounds to improve accuracy.';
  if (mode === 'balanced') return 'Maintain consistent decisions.';

  if (mode === 'opportunity') {
    if (component === 'putting') return 'Focus on lag putting pace.';
    if (component === 'approach') return 'Focus on tightening approach dispersion.';
    if (component === 'offTee') return 'Focus on safer targets off the tee.';
    if (component === 'penalties') return 'Keep penalties out of play.';
    return 'Maintain consistent decisions.';
  }

  if (component === 'putting') return 'Keep building confidence on the greens.';
  if (component === 'approach') return 'Keep trusting your approach play.';
  if (component === 'offTee') return 'Keep driving the ball with confidence.';
  if (component === 'penalties') return 'Keep avoiding costly mistakes.';
  return 'Maintain consistent decisions.';
}

function missingRecentStatLabels(summary: DashboardOverallInsightsSummary): string[] {
  const coverage = summary.statCoverage;
  if (!coverage) {
    return summary.dataQualityFlags.missingComponentData
      ? ['penalties', 'GIR']
      : [];
  }

  const missingByPriority = [
    coverage.penalties.tracked < MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS ? 'penalties' : null,
    coverage.gir.tracked < MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS ? 'GIR' : null,
    coverage.fir.tracked < MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS ? 'FIR' : null,
    coverage.putts.tracked < MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS ? 'putts' : null,
  ].filter((label): label is string => label != null);

  return missingByPriority.slice(0, 2);
}

function componentCoverageKey(
  component: Exclude<DashboardFocusComponent, 'residual'>,
): keyof NonNullable<DashboardOverallInsightsSummary['statCoverage']> {
  if (component === 'offTee') return 'fir';
  if (component === 'approach') return 'gir';
  if (component === 'putting') return 'putts';
  return 'penalties';
}

function hasEnoughCoverageForComponent(
  summary: DashboardOverallInsightsSummary,
  component: Exclude<DashboardFocusComponent, 'residual'>,
): boolean {
  if (!summary.statCoverage) return true;
  const key = componentCoverageKey(component);
  return summary.statCoverage[key].tracked >= MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS;
}

function measuredComponentCount(summary: DashboardOverallInsightsSummary): number {
  const sg = summary.sgComponentDelta;
  if (!sg) return 0;
  return [sg.offTee, sg.approach, sg.putting, sg.penalties].filter(
    (value) => value != null && Number.isFinite(value),
  ).length;
}

function hasCredibleComponentSignal(summary: DashboardOverallInsightsSummary): boolean {
  if (summary.dataQualityFlags.residualDominant) return false;
  if (summary.confidence === 'low') return false;
  return measuredComponentCount(summary) >= MIN_MEASURED_COMPONENTS_FOR_COMPONENT_FOCUS;
}

function compactNextRoundNudge(
  recommendationText: string | null,
  component: Exclude<DashboardFocusComponent, 'residual'> | null,
  mode: SgFocusMode,
): string {
  const fallback = fallbackNextRoundNudge(component, mode);
  if (!recommendationText) return fallback;

  const normalized = recommendationText.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length > MAX_NEXT_ROUND_RECOMMENDATION_LENGTH) return fallback;
  if (normalized.includes(':')) return fallback;
  if (/\d/.test(normalized)) return fallback;
  if ((normalized.match(/[.!?]/g) ?? []).length > 1) return fallback;
  if (/\b(goal|drill|balls?|yards?|feet|fringe|range|score)\b/i.test(normalized)) return fallback;
  if (!/^(focus on|keep)\b/i.test(normalized)) return fallback;

  const withoutTrailingPunctuation = normalized.replace(/[.!?]+$/g, '').trim();
  if (!withoutTrailingPunctuation) return fallback;

  const capitalized = withoutTrailingPunctuation.charAt(0).toUpperCase() + withoutTrailingPunctuation.slice(1);
  return `${capitalized}.`;
}

function selectSgFocus(summary: DashboardOverallInsightsSummary): SelectedSgFocus | null {
  const sg = summary.sgComponentDelta;
  if (!sg) return null;
  if (!hasCredibleComponentSignal(summary)) return null;

  const components: Array<{
    component: Exclude<DashboardFocusComponent, 'residual'>;
    delta: number;
  }> = [];

  if (sg.offTee != null && Number.isFinite(sg.offTee)) {
    components.push({ component: 'offTee', delta: sg.offTee });
  }
  if (sg.approach != null && Number.isFinite(sg.approach)) {
    components.push({ component: 'approach', delta: sg.approach });
  }
  if (sg.putting != null && Number.isFinite(sg.putting)) {
    components.push({ component: 'putting', delta: sg.putting });
  }
  if (sg.penalties != null && Number.isFinite(sg.penalties)) {
    components.push({ component: 'penalties', delta: sg.penalties });
  }

  if (components.length === 0) return null;

  const coveredComponents = components.filter((entry) =>
    hasEnoughCoverageForComponent(summary, entry.component),
  );
  if (coveredComponents.length < MIN_MEASURED_COMPONENTS_FOR_COMPONENT_FOCUS) return null;

  const orderedByOpportunity = [...coveredComponents].sort((a, b) => a.delta - b.delta);
  const opportunity = orderedByOpportunity[0];
  if (opportunity?.delta <= SG_OPPORTUNITY_THRESHOLD + SG_THRESHOLD_EPSILON) {
    const secondLowest = orderedByOpportunity[1] ?? null;
    const separation = secondLowest ? secondLowest.delta - opportunity.delta : Number.POSITIVE_INFINITY;
    if (separation <= SG_OPPORTUNITY_SEPARATION_THRESHOLD) {
      return {
        mode: 'balanced',
        component: null,
        sgDelta: null,
      };
    }

    return {
      mode: 'opportunity',
      component: opportunity.component,
      sgDelta: roundOne(opportunity.delta),
    };
  }

  const strength = coveredComponents
    .filter((entry) => entry.delta >= SG_STRENGTH_THRESHOLD - SG_THRESHOLD_EPSILON)
    .sort((a, b) => b.delta - a.delta)[0];
  if (strength) {
    return {
      mode: 'strength',
      component: strength.component,
      sgDelta: roundOne(strength.delta),
    };
  }

  return {
    mode: 'balanced',
    component: null,
    sgDelta: null,
  };
}

function scoreFocusOutcome(
  summary: DashboardOverallInsightsSummary,
): Extract<
  RoundFocusOutcome,
  'score_only_stable' | 'score_only_improving' | 'score_only_worsening'
> {
  const delta = summary.scoreTrendDelta ?? 0;
  const threshold = scoreNearThreshold(summary.mode);
  if (delta < -threshold) return 'score_only_improving';
  if (delta > threshold) return 'score_only_worsening';
  return 'score_only_stable';
}

function buildScoreOnlyFocus(summary: DashboardOverallInsightsSummary): RoundFocusPayload {
  const delta = summary.scoreTrendDelta ?? 0;
  const outcome = scoreFocusOutcome(summary);
  const missingLabels = missingRecentStatLabels(summary);
  const missingList = statList(missingLabels);

  let body = 'Recent scoring is in line with your baseline.';
  let nextRound = missingLabels.length
    ? `Track ${missingList} to refine your insight.`
    : 'Keep tracking scores and target one scoring improvement.';

  if (outcome === 'score_only_improving') {
    body = `Recent scoring is ${formatOneDecimal(Math.abs(delta))} strokes better than baseline.`;
    nextRound = missingLabels.length
      ? `Track ${missingList} to refine your insight.`
      : "Keep doing what's working and protect against big numbers.";
  } else if (outcome === 'score_only_worsening') {
    body = `Recent scoring is ${formatOneDecimal(Math.abs(delta))} strokes worse than baseline.`;
    nextRound = missingLabels.length
      ? `Track ${missingList} to refine your insight.`
      : 'Prioritize conservative targets and avoid penalties.';
  }

  return {
    outcome,
    focusType: 'score',
    headline: 'Your scoring trend is the priority right now.',
    body,
    nextRound,
    component: null,
    confidence: summary.confidence,
  };
}

function buildSgDrivenFocus(
  summary: DashboardOverallInsightsSummary,
  selected: SelectedSgFocus,
): RoundFocusPayload {
  if (selected.mode === 'balanced' || !selected.component || selected.sgDelta == null) {
    return {
      outcome: 'component_balanced',
      focusType: 'component',
      headline: 'Your game is well balanced right now.',
      body: 'No single area is significantly impacting your score.',
      nextRound: fallbackNextRoundNudge(null, 'balanced'),
      component: null,
      confidence: summary.confidence,
    };
  }

  const componentLabel = componentHeadlineName(selected.component);
  const scoreOutcome = scoreFocusOutcome(summary);

  const headline =
    selected.mode === 'opportunity'
      ? `${componentLabel} is your biggest scoring opportunity.`
      : scoreOutcome === 'score_only_worsening'
      ? `${componentLabel} is your strongest area right now.`
      : `${componentLabel} is driving your improvement.`;

  const body =
    selected.mode === 'opportunity'
      ? `You're losing ${formatApproxSg(selected.sgDelta)} strokes per round compared to baseline.`
      : `This area is gaining ${formatApproxSg(selected.sgDelta)} strokes per round compared to baseline.`;

  return {
    outcome: selected.mode === 'opportunity' ? 'component_opportunity' : 'component_strength',
    focusType: 'component',
    headline,
    body,
    nextRound: compactNextRoundNudge(summary.recommendationText, selected.component, selected.mode),
    component: selected.component,
    confidence: summary.confidence,
  };
}

export function buildDashboardOverallInsightsSummary(
  insightsPayload: unknown,
  mode: StatsMode,
): DashboardOverallInsightsSummary | null {
  if (!insightsPayload || typeof insightsPayload !== 'object') return null;

  const payload = insightsPayload as Record<string, any>;
  const modePayload = payload.mode_payload?.[mode];
  const modePayloadNine = payload.mode_payload?.['9'];
  const modePayloadEighteen = payload.mode_payload?.['18'];
  if (!modePayload || typeof modePayload !== 'object') return null;

  const roundsRecent = toNumberOrNull(modePayload.kpis?.roundsRecent) ?? 0;
  const avgScoreRecent = toNumberOrNull(modePayload.kpis?.avgScoreRecent);
  const avgScoreBaseline = toNumberOrNull(modePayload.kpis?.avgScoreBaseline);
  const scoreTrendDelta = roundOne(toNumberOrNull(modePayload.kpis?.deltaVsBaseline));
  const consistencySpread = roundOne(toNumberOrNull(modePayload.consistency?.stdDev));
  const consistencyLabel = normalizeConsistencyLabel(modePayload.consistency?.label);
  const projectionByMode = payload.projection_by_mode?.[mode];
  const projectionScore = roundOne(toNumberOrNull(projectionByMode?.projectedScoreIn10));
  const projectionLow = roundOne(toNumberOrNull(projectionByMode?.scoreLow));
  const projectionHigh = roundOne(toNumberOrNull(projectionByMode?.scoreHigh));
  const projectionHandicap = roundOne(toNumberOrNull(payload.projection?.projectedHandicapIn10));
  const sgComponents = modePayload.sgComponents;
  const efficiency = modePayload.efficiency;
  const firRecent = toNumberOrNull(efficiency?.fir?.recent);
  const firBaseline = toNumberOrNull(efficiency?.fir?.baseline);
  const girRecent = toNumberOrNull(efficiency?.gir?.recent);
  const girBaseline = toNumberOrNull(efficiency?.gir?.baseline);
  const puttsRecent = toNumberOrNull(efficiency?.puttsTotal?.recent);
  const puttsBaseline = toNumberOrNull(efficiency?.puttsTotal?.baseline);
  const penaltiesRecent = toNumberOrNull(efficiency?.penaltiesPerRound?.recent);
  const penaltiesBaseline = toNumberOrNull(efficiency?.penaltiesPerRound?.baseline);
  const efficiencyDelta = {
    firPctPoints:
      firRecent != null && firBaseline != null ? roundOne((firRecent - firBaseline) * 100) : null,
    girPctPoints:
      girRecent != null && girBaseline != null ? roundOne((girRecent - girBaseline) * 100) : null,
    putts:
      puttsRecent != null && puttsBaseline != null ? roundOne(puttsRecent - puttsBaseline) : null,
    penalties:
      penaltiesRecent != null && penaltiesBaseline != null
        ? roundOne(penaltiesRecent - penaltiesBaseline)
        : null,
  };
  const statCoverage = efficiency && typeof efficiency === 'object'
    ? {
        fir: parseCoverage(
          efficiency.fir?.coverageRecent,
          firRecent == null ? 0 : roundsRecent,
          roundsRecent,
        ),
        gir: parseCoverage(
          efficiency.gir?.coverageRecent,
          girRecent == null ? 0 : roundsRecent,
          roundsRecent,
        ),
        putts: parseCoverage(
          efficiency.puttsTotal?.coverageRecent,
          puttsRecent == null ? 0 : roundsRecent,
          roundsRecent,
        ),
        penalties: parseCoverage(
          efficiency.penaltiesPerRound?.coverageRecent,
          penaltiesRecent == null ? 0 : roundsRecent,
          roundsRecent,
        ),
      }
    : null;
  const sgDeltas = sgComponents?.hasData
    ? {
        offTee: deltaOrNull(
          sgComponents.recentAvg?.offTee,
          sgComponents.baselineAvg?.offTee,
        ),
        approach: deltaOrNull(
          sgComponents.recentAvg?.approach,
          sgComponents.baselineAvg?.approach,
        ),
        putting: deltaOrNull(
          sgComponents.recentAvg?.putting,
          sgComponents.baselineAvg?.putting,
        ),
        penalties: deltaOrNull(
          sgComponents.recentAvg?.penalties,
          sgComponents.baselineAvg?.penalties,
        ),
        residual: deltaOrNull(
          sgComponents.recentAvg?.residual,
          sgComponents.baselineAvg?.residual,
        ),
      }
    : null;

  const residualDominant = isResidualDominant(sgDeltas);
  const biggestLeakComponent = pickBiggestLeakComponent(sgDeltas);
  const missingRecentStatCount = statCoverage
    ? [
        statCoverage.fir,
        statCoverage.gir,
        statCoverage.putts,
        statCoverage.penalties,
      ].filter((coverage) => coverage.tracked < MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS).length
    : 0;
  const roundsRecentNine = toNumberOrNull(modePayloadNine?.kpis?.roundsRecent) ?? 0;
  const roundsRecentEighteen = toNumberOrNull(modePayloadEighteen?.kpis?.roundsRecent) ?? 0;
  const combinedNeedsMoreNineHoleRounds =
    mode === 'combined' &&
    roundsRecentNine === 0 &&
    roundsRecentEighteen > 0 &&
    roundsRecent < MIN_ROUNDS_FOR_TRENDS;

  const recentWindow = toNumberOrNull(payload.tier_context?.recentWindow) ?? 5;

  return {
    lastUpdatedAt:
      typeof payload.generated_at === 'string' && payload.generated_at.length > 0
        ? payload.generated_at
        : null,
    drillSeed:
      typeof payload.data_hash === 'string' && payload.data_hash.length > 0
        ? payload.data_hash
        : null,
    recommendationText: pickRecommendationText(payload, mode),
    mode,
    roundsRecent,
    recentWindow,
    scoreTrendDelta,
    trajectoryLabel: classifyTrajectoryLabelFromScoring({
      mode,
      roundsRecent,
      avgScoreRecentRaw: avgScoreRecent,
      avgScoreBaselineRaw: avgScoreBaseline,
      deltaFallbackRaw: scoreTrendDelta,
    }),
    consistencyLabel,
    consistencySpread,
    projectionScore,
    projectionScoreRange:
      projectionLow == null && projectionHigh == null
        ? null
        : {
            low: projectionLow,
            high: projectionHigh,
          },
    projectionHandicap,
    sgComponentDelta: sgDeltas,
    efficiencyDelta,
    statCoverage,
    biggestLeakComponent,
    confidence: normalizeConfidence(payload.sg?.components?.latest?.confidence),
    dataQualityFlags: {
      insufficientRounds: roundsRecent < MIN_ROUNDS_FOR_TRENDS,
      missingScoreTrend: scoreTrendDelta == null,
      combinedNeedsMoreNineHoleRounds,
      missingComponentData: !hasAnyMeasuredComponentData(sgDeltas),
      partialRecentStats: missingRecentStatCount > 0,
      residualDominant,
      volatileScoring:
        consistencyLabel === 'Volatile' ||
        (consistencySpread != null && consistencySpread > VOLATILE_STDDEV_THRESHOLD),
    },
  };
}

export function buildRoundFocusState(
  summary: DashboardOverallInsightsSummary | null,
  isPremium: boolean,
  isLimited: boolean,
): RoundFocusState {
  const lockedReason = getLockedReason(summary);
  if (lockedReason) {
    return {
      kind: 'NEED_MORE_ROUNDS',
      outcome: 'locked',
      lockedReason,
      roundsLogged: summary?.roundsRecent ?? 0,
      minRounds: MIN_ROUNDS_FOR_TRENDS,
    };
  }
  if (!summary) {
    return {
      kind: 'NEED_MORE_ROUNDS',
      outcome: 'locked',
      lockedReason: 'missing_summary',
      roundsLogged: 0,
      minRounds: MIN_ROUNDS_FOR_TRENDS,
    };
  }

  const sgFocus = selectSgFocus(summary);

  if (!sgFocus) {
    const fallbackFocus = buildScoreOnlyFocus(summary);
    if (!isPremium) {
      return {
        kind: 'READY_FREE',
        focus: fallbackFocus,
        isLimited,
      };
    }
    return {
      kind: 'READY_PREMIUM',
      focus: fallbackFocus,
    };
  }

  const focus = buildSgDrivenFocus(summary, sgFocus);

  if (!isPremium) {
    return {
      kind: 'READY_FREE',
      focus,
      isLimited,
    };
  }

  return {
    kind: 'READY_PREMIUM',
    focus,
  };
}

export function focusComponentLabel(component: DashboardFocusComponent | null): string | null {
  if (!component) return null;
  return componentDisplayName(component);
}
