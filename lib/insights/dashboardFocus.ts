import {
  pickDeterministicDrillSeeded,
  type SGComponentName,
  type StatsMode,
} from '@/lib/insights/overall';

export type DashboardFocusComponent =
  | 'offTee'
  | 'approach'
  | 'putting'
  | 'penalties'
  | 'residual';
export type DashboardFocusConfidence = 'high' | 'medium' | 'low' | null;

export type DashboardOverallInsightsSummary = {
  lastUpdatedAt: string | null;
  drillSeed: string | null;
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
  biggestLeakComponent: DashboardFocusComponent | null;
  confidence: DashboardFocusConfidence;
  dataQualityFlags: {
    insufficientRounds: boolean;
    missingScoreTrend: boolean;
    combinedNeedsMoreNineHoleRounds: boolean;
    missingComponentData: boolean;
    residualDominant: boolean;
    volatileScoring: boolean;
  };
};

export type RoundFocusPayload = {
  focusType: 'score' | 'component';
  headline: string;
  body: string;
  supportingLine?: string;
  drillLine?: string;
  component: DashboardFocusComponent | null;
  confidence: DashboardFocusConfidence;
  basedOnCaption?: string;
};

export type RoundFocusState =
  | { kind: 'NEED_MORE_ROUNDS'; roundsLogged: number; minRounds: number }
  | { kind: 'READY_PREMIUM'; focus: RoundFocusPayload }
  | { kind: 'READY_FREE'; focus: RoundFocusPayload; isLimited: boolean };

const VOLATILE_STDDEV_THRESHOLD = 4;
const LEAK_TIE_THRESHOLD = 0.1;
const ROUNDING_FACTOR = 10;
const RESIDUAL_DOMINANT_THRESHOLD = 0.3;
const RESIDUAL_OTHER_COMPONENT_MAX = 0.15;
const MIN_ROUNDS_FOR_TRENDS = 3;

const SG_TIE_BREAK_ORDER: DashboardFocusComponent[] = [
  'penalties',
  'putting',
  'approach',
  'offTee',
];

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
  return roundOne(recent - baseline);
}

function formatOneDecimal(value: number): string {
  return (Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR).toFixed(1);
}

function absOneDecimal(value: number): string {
  return formatOneDecimal(Math.abs(value));
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

function hasAnyComponentData(deltas: DashboardOverallInsightsSummary['sgComponentDelta']): boolean {
  if (!deltas) return false;
  return Object.values(deltas).some((value) => value != null && Number.isFinite(value));
}

function componentDisplayName(component: DashboardFocusComponent): string {
  if (component === 'offTee') return 'Off the Tee';
  if (component === 'approach') return 'Approach';
  if (component === 'putting') return 'Putting';
  if (component === 'penalties') return 'Penalties';
  return 'Residual';
}

function mapFocusComponentToArea(component: DashboardFocusComponent): SGComponentName | null {
  if (component === 'offTee') return 'off_tee';
  if (component === 'approach') return 'approach';
  if (component === 'putting') return 'putting';
  if (component === 'penalties') return 'penalties';
  return null;
}

function compactDrillForCard(raw: string): string {
  const withoutGoal = raw.split(' Goal:')[0].trim();
  const sentence = withoutGoal.endsWith('.') ? withoutGoal : `${withoutGoal}.`;
  return sentence;
}

function premiumDrill(summary: DashboardOverallInsightsSummary, component: DashboardFocusComponent): string {
  const area = mapFocusComponentToArea(component);
  const seedBase =
    summary.drillSeed ??
    [
      summary.mode,
      summary.lastUpdatedAt ?? 'na',
      summary.roundsRecent,
      summary.scoreTrendDelta ?? 'na',
    ].join('|');
  const seed = `${seedBase}|dashboard_focus|${component}`;
  const selected = pickDeterministicDrillSeeded(area, seed, 0);
  return `Do this next: ${compactDrillForCard(selected)}`;
}

function componentBody(component: DashboardFocusComponent, delta: number | null): string {
  const deltaText = delta == null ? '-' : absOneDecimal(delta);
  if (component === 'offTee') {
    return `Off the Tee is costing ${deltaText} strokes vs baseline. Pick one fairway-first club on tight holes and commit to it.`;
  }
  if (component === 'approach') {
    return `Approach is down ${deltaText} strokes vs baseline. Aim center-green when uncertain and avoid short-siding.`;
  }
  if (component === 'putting') {
    return `Putting is down ${deltaText} strokes vs baseline. Prioritize pace that leaves a tap-in, especially downhill.`;
  }
  if (component === 'penalties') {
    return `Penalties are costing ${deltaText} strokes vs baseline. Choose the conservative line any time trouble is in play.`;
  }
  return 'Most of your performance signal is untracked. Add putts and penalties this round to unlock a clearer focus.';
}

function buildScoreFocus(summary: DashboardOverallInsightsSummary): RoundFocusPayload {
  const delta = summary.scoreTrendDelta ?? 0;
  const scoreNear = scoreNearThreshold(summary.mode);
  const consistencyLine = summary.dataQualityFlags.volatileScoring
    ? 'Your scoring is volatile. This round, the win is avoiding doubles.'
    : 'Stay disciplined with the same swing and smarter targets.';

  let headline = 'Turn stability into progress.';
  let body =
    'Scores are holding steady. Pick one simple goal: fewer doubles or fewer three-putts.';

  if (delta < -scoreNear) {
    headline = 'Build on momentum.';
    body = `Recent scoring is ${absOneDecimal(delta)} strokes better than baseline. Keep your current game plan and protect against big numbers.`;
  } else if (Math.abs(delta) <= scoreNear) {
    headline = 'Turn stability into progress.';
    body =
      'Scores are holding steady. Pick one simple goal: fewer doubles or fewer three-putts.';
  } else if (delta > scoreNear) {
    headline = 'Stop the leak.';
    body =
      'Recent scores are above baseline. Focus on conservative decisions and eliminating penalty strokes.';
  }

  return {
    focusType: 'score',
    headline,
    body,
    supportingLine: consistencyLine,
    component: null,
    confidence: summary.confidence,
    basedOnCaption: summary.recentWindow === 5 ? 'Based on last 5 vs baseline' : undefined,
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
    biggestLeakComponent,
    confidence: normalizeConfidence(payload.sg?.components?.latest?.confidence),
    dataQualityFlags: {
      insufficientRounds: roundsRecent < MIN_ROUNDS_FOR_TRENDS,
      missingScoreTrend: scoreTrendDelta == null,
      combinedNeedsMoreNineHoleRounds,
      missingComponentData: !hasAnyComponentData(sgDeltas),
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
  if (
    !summary ||
    summary.dataQualityFlags.insufficientRounds ||
    summary.dataQualityFlags.missingScoreTrend ||
    summary.dataQualityFlags.combinedNeedsMoreNineHoleRounds
  ) {
    return {
      kind: 'NEED_MORE_ROUNDS',
      roundsLogged: summary?.roundsRecent ?? 0,
      minRounds: MIN_ROUNDS_FOR_TRENDS,
    };
  }

  if (!isPremium) {
    return {
      kind: 'READY_FREE',
      focus: buildScoreFocus(summary),
      isLimited,
    };
  }

  const missingComponentData =
    summary.dataQualityFlags.missingComponentData || !summary.sgComponentDelta;
  const component = summary.biggestLeakComponent;

  if (summary.dataQualityFlags.residualDominant || missingComponentData) {
    return {
      kind: 'READY_PREMIUM',
      focus: {
        focusType: 'component',
        headline: 'Track 1 extra stat this round.',
        body: 'Most of your performance signal is untracked. Add putts and penalties for a clearer focus.',
        drillLine: premiumDrill(summary, 'residual'),
        component: 'residual',
        confidence: summary.confidence,
        basedOnCaption: summary.recentWindow === 5 ? 'Based on last 5 vs baseline' : undefined,
      },
    };
  }

  if (
    !component ||
    component === 'residual' ||
    !summary.sgComponentDelta ||
    summary.sgComponentDelta[component] == null
  ) {
    return {
      kind: 'READY_PREMIUM',
      focus: buildScoreFocus(summary),
    };
  }

  const componentDelta = summary.sgComponentDelta[component];
  const headline =
    component === 'offTee'
      ? 'Priority: Fairway-first tee shots.'
      : component === 'approach'
      ? 'Priority: Start-line control on approaches.'
      : component === 'putting'
      ? 'Priority: Speed control.'
      : 'Priority: Zero penalty strokes.';

  const lowConfidenceLine =
    summary.confidence === 'low'
      ? 'Low confidence due to limited tracked stats. Log FIR, GIR, putts, and penalties to sharpen this focus.'
      : undefined;

  return {
    kind: 'READY_PREMIUM',
    focus: {
      focusType: 'component',
      headline,
      body: componentBody(component, componentDelta),
      supportingLine: lowConfidenceLine,
      drillLine: premiumDrill(summary, component),
      component,
      confidence: summary.confidence,
      basedOnCaption: summary.recentWindow === 5 ? 'Based on last 5 vs baseline' : undefined,
    },
  };
}

export function focusComponentLabel(component: DashboardFocusComponent | null): string | null {
  if (!component) return null;
  return componentDisplayName(component);
}
