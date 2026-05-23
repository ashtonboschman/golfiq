import {
  type StatsMode,
} from '@/lib/insights/overall';
import {
  classifyBalancedComponents,
  classifyVolatilitySignal,
  downgradePersistenceTierForWeakness,
  resolvePersistenceTierFromFrequency,
  type SharedPersistenceTier,
} from '@/lib/insights/sharedSignals';

export type DashboardFocusComponent =
  | 'offTee'
  | 'approach'
  | 'shortGame'
  | 'putting'
  | 'penalties'
  | 'residual';
export type DashboardFocusConfidence = 'high' | 'medium' | 'low' | null;
export type RoundFocusOutcome =
  | 'early_guidance'
  | 'score_only_stable'
  | 'score_only_improving'
  | 'score_only_worsening'
  | 'volatility_priority'
  | 'component_opportunity'
  | 'component_strength'
  | 'component_balanced';

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
    shortGame?: number | null;
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
  persistenceSignal: {
    component: Exclude<DashboardFocusComponent, 'residual'> | null;
    count: number;
    window: number;
    tier: 'temporary' | 'emerging' | 'persistent' | null;
  } | null;
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
  outcome: RoundFocusOutcome;
  focusType: 'score' | 'component';
  headline: string;
  body: string;
  nextRound: string;
  component: DashboardFocusComponent | null;
  confidence: DashboardFocusConfidence;
};

export type RoundFocusState =
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
  'shortGame',
  'putting',
  'approach',
  'offTee',
];

type SgFocusMode = 'opportunity' | 'strength' | 'balanced';
type PersistenceTier = 'temporary' | 'emerging' | 'persistent' | null;
type SelectedSgFocus = {
  mode: SgFocusMode;
  component: Exclude<DashboardFocusComponent, 'residual'> | null;
  sgDelta: number | null;
  persistenceTier: PersistenceTier;
};

const SG_OPPORTUNITY_THRESHOLD = -0.15;
const SG_STRENGTH_THRESHOLD = 0.15;
const SG_OPPORTUNITY_SEPARATION_THRESHOLD = 0.03;
const SG_THRESHOLD_EPSILON = 0.000001;
const MAX_NEXT_ROUND_RECOMMENDATION_LENGTH = 64;
const MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS = 3;
const MIN_MEASURED_COMPONENTS_FOR_COMPONENT_FOCUS = 3;
const PERSISTENCE_EMERGING_MIN_COUNT = 2;
const PERSISTENCE_PERSISTENT_MIN_COUNT = 4;
const PERSISTENCE_EMERGING_BONUS = 0.08;
const PERSISTENCE_PERSISTENT_BONUS = 0.18;
const VOLATILITY_OVERRIDE_MAX_COMPONENT_ABS = 0.35;
const TINY_DELTA_ABS_SUPPRESS_THRESHOLD = 0.15;
const MANY_ROUND_SCORE_ONLY_MIN_ROUNDS = 5;

const EARLY_GUIDANCE_NUDGES = [
  'Play to the widest target.',
  'Choose the safest target first.',
  'Keep the difficult miss out of play.',
] as const;

const SCORE_ONLY_STABLE_NUDGES = [
  'Commit to one focus.',
  'Pick one scoring habit to protect.',
  'Choose one simple target pattern.',
] as const;

const SCORE_ONLY_IMPROVING_NUDGES = [
  "Keep doing what's working.",
  'Keep avoiding big numbers.',
  'Stay with the safer choices.',
] as const;

const SCORE_ONLY_WORSENING_NUDGES = [
  'Prioritize conservative targets.',
  'Keep the ball in play first.',
  'Avoid the miss that brings double into play.',
] as const;

const BALANCED_VOLATILE_NUDGES = [
  'Choose conservative targets after misses.',
  'Reset the hole after trouble.',
  'Protect bogey when the hole gets messy.',
] as const;

const BALANCED_STABLE_NUDGES = [
  'Play to center-green targets.',
  'Choose targets with room to miss.',
  'Keep the next shot simple.',
] as const;

const VOLATILITY_PENALTY_NUDGES = [
  'Choose the safest line on risk holes.',
  'Keep penalty trouble out of the miss.',
  'Play for the miss that stays in play.',
] as const;

const VOLATILITY_APPROACH_NUDGES = [
  'Play to center-green targets.',
  'Favor the safe side of the green.',
  'Take the short-sided miss out of play.',
] as const;

const VOLATILITY_GENERAL_NUDGES = [
  'Prioritize in-play misses on every hole.',
  'Keep the big miss out of play.',
  'Choose the line that protects bogey.',
] as const;

const OPPORTUNITY_NUDGES = {
  putting: [
    'Focus on lag speed.',
    'Prioritize pace over perfect reads.',
    'Leave shorter second putts.',
  ],
  approach: [
    'Play to the center of the green.',
    'Favor the safe side of the green.',
    'Take the short-sided miss out of play.',
  ],
  shortGame: [
    'Choose the simplest up-and-down play.',
    'Leave the easiest next putt.',
    'Keep recovery shots simple.',
  ],
  offTee: [
    'Choose a target that keeps your common miss in play.',
    'Pick the tee target with room to miss.',
    'Keep trouble out of your normal miss.',
  ],
  penalties: [
    'Choose the safe line.',
    'Keep penalty trouble out of play.',
    'Favor position over distance.',
  ],
} as const;

const STRENGTH_NUDGES = {
  putting: [
    'Keep prioritizing pace control.',
    'Stay committed to pace control.',
    'Keep first putts stress-free.',
  ],
  approach: [
    'Keep choosing smart approach targets.',
    'Keep choosing smart approach targets.',
    'Stay with the safe green sections.',
  ],
  shortGame: [
    'Keep choosing simple recovery shots.',
    'Keep choosing simple recovery shots.',
    'Stay with the recovery shot you can control.',
  ],
  offTee: [
    'Keep choosing playable tee targets.',
    'Keep choosing playable tee targets.',
    'Stay with the tee plan that avoids trouble.',
  ],
  penalties: [
    'Keep choosing safe lines.',
    'Keep penalty trouble out of play.',
    'Stay committed to safer targets.',
  ],
} as const;

const EARLY_GUIDANCE_HEADLINES = [
  'Start with solid decisions.',
  'Build the round around simple choices.',
  'Start by keeping the ball in play.',
] as const;

const EARLY_GUIDANCE_BODIES = [
  'Early rounds usually come down to missed scoring chances and a few recovery-heavy holes.',
  'Early patterns usually show up through missed chances and harder recovery holes.',
  'At this stage, steady targets matter more than chasing one perfect stat.',
] as const;

const SCORE_ONLY_STABLE_HEADLINES = [
  'Your scoring is stable.',
  'Your scoring pattern is steady.',
  'Your recent scores are holding steady.',
] as const;

const SCORE_ONLY_STABLE_BODIES_PREMIUM = [
  'Your scoring is in line with your usual level.',
  'Your recent scoring is staying close to your usual range.',
  'Your scores are holding near your current baseline.',
] as const;

const SCORE_ONLY_STABLE_BODIES_FREE_MED = [
  'Your scoring trend is established, but detail stats are still limited.',
  'Your score trend is forming, but the stat detail is still light.',
  'Your recent scoring has a pattern, but the details are still building.',
] as const;

const SCORE_ONLY_STABLE_BODIES_FREE_LOW = [
  'Pick one area next round.',
  'Keep the focus simple next round.',
  'Choose one scoring habit to protect.',
] as const;

const SCORE_ONLY_IMPROVING_HEADLINES = [
  'Your scores are improving.',
  'Your scoring is trending better.',
  'Your recent scores are moving the right way.',
] as const;

const SCORE_ONLY_IMPROVING_BODIES_FREE = [
  'Keep avoiding big numbers.',
  'Keep protecting the scorecard from doubles.',
  'Stay with the choices that limit damage.',
] as const;

const SCORE_ONLY_WORSENING_HEADLINES = [
  'Your scores are slipping.',
  'Your recent scores are trending higher.',
  'Scoring has moved the wrong way lately.',
] as const;

const SCORE_ONLY_WORSENING_BODIES_FREE_MED = [
  'Scores are trending higher than usual. Safer choices can steady the pattern.',
  'Recent scores are moving higher. Safer targets can help settle the round.',
  'Scoring has slipped lately. Keeping trouble out of play is the first fix.',
] as const;

const SCORE_ONLY_WORSENING_BODIES_FREE_LOW = [
  'Play to safer targets.',
  'Keep the ball in play first.',
  'Choose the miss that stays playable.',
] as const;

const BALANCED_HEADLINES_HIGH = [
  'No single stat is your main scoring limiter.',
  'No single area is driving the scoring pattern.',
  'Your scoring is not coming from one obvious leak.',
] as const;

const BALANCED_HEADLINES_MED = [
  'No single area clearly dominates right now.',
  'No single area stands out clearly yet.',
  'The scoring pattern is spread across a few areas.',
] as const;

const BALANCED_BODIES_PREMIUM_VOLATILE = [
  'Your scoring ceiling now depends on reducing costly swings from hole to hole.',
  'Bigger score swings are doing more damage than one small stat gap.',
  'Stabilizing the costly holes matters more than chasing one category.',
] as const;

const BALANCED_BODIES_PREMIUM_STABLE = [
  'Round-management choices now matter more than chasing one stat fix.',
  'Small decisions across the round are likely worth more than one stat fix.',
  'Keeping misses playable matters more than forcing one category right now.',
] as const;

const BALANCED_BODIES_FREE_VOLATILE = [
  'Small misses across holes are adding up more than one obvious leak.',
  'Costly stretches are adding more pressure than one clear stat issue.',
  'A few messy holes are doing more damage than one single area.',
] as const;

const BALANCED_BODIES_FREE_STABLE = [
  'Round-management choices are likely worth more than forcing one stat fix.',
  'Keeping the round simple is worth more than chasing one stat right now.',
  'Safer targets across the round are the best focus for now.',
] as const;

const VOLATILITY_HEADLINES_HIGH = [
  'Scoring volatility is your top priority.',
  'Large score swings are the main scoring issue.',
  'Costly swings are the clearest focus right now.',
] as const;

const VOLATILITY_HEADLINES_MED = [
  'Scoring volatility is likely holding scores back.',
  'Large score swings are likely limiting progress.',
  'Costly swings are likely the main scoring issue.',
] as const;

const VOLATILITY_BODIES_PREMIUM_HIGH = [
  'Round-to-round swings are costing more than any mild single-area leak right now.',
  'Large score swings are doing more damage than one modest stat gap.',
  'Stabilizing the costly holes matters more than chasing one mild leak.',
] as const;

const VOLATILITY_BODIES_PREMIUM_MED = [
  'Large score swings are limiting improvement more than one small stat gap.',
  'Costly swings are likely holding back progress more than one small leak.',
  'The round-to-round swings matter more than one mild category gap right now.',
] as const;

const VOLATILITY_BODIES_FREE = [
  'Large score swings are adding strokes faster than one mild stat leak.',
  'Costly stretches are doing more damage than one small stat gap.',
  'A few big-number stretches are adding strokes quickly.',
] as const;

function stableIndex(seed: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

function pickDashboardVariant<T extends readonly string[]>(
  variants: T,
  seedParts: Array<string | number | null | undefined>,
): T[number] {
  const seed = seedParts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join('|');
  return variants[stableIndex(seed, variants.length)];
}

function mapPersistedComponent(raw: unknown): Exclude<DashboardFocusComponent, 'residual'> | null {
  if (raw === 'offTee') return 'offTee';
  if (raw === 'approach') return 'approach';
  if (raw === 'shortGame') return 'shortGame';
  if (raw === 'putting') return 'putting';
  if (raw === 'penalties') return 'penalties';
  return null;
}

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

function formatAboutSg(value: number): string {
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

function resolveFocusConfidence(value: DashboardFocusConfidence): Exclude<DashboardFocusConfidence, null> {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function isTinyDelta(delta: number | null): boolean {
  return delta != null && Number.isFinite(delta) && Math.abs(delta) < TINY_DELTA_ABS_SUPPRESS_THRESHOLD;
}

function shouldUseMatureScoreOnlyForLowConfidence(summary: DashboardOverallInsightsSummary): boolean {
  if (summary.roundsRecent < MANY_ROUND_SCORE_ONLY_MIN_ROUNDS) return false;
  if (summary.scoreTrendDelta == null) return false;
  return summary.dataQualityFlags.missingComponentData || summary.dataQualityFlags.partialRecentStats;
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

  const others = [deltas.offTee, deltas.approach, deltas.shortGame, deltas.putting, deltas.penalties]
    .filter((value): value is number => value != null && Number.isFinite(value))
    .map((value) => Math.abs(value));
  if (others.length === 0) return true;
  return Math.max(...others) <= RESIDUAL_OTHER_COMPONENT_MAX;
}

function hasAnyMeasuredComponentData(deltas: DashboardOverallInsightsSummary['sgComponentDelta']): boolean {
  if (!deltas) return false;
  return [deltas.offTee, deltas.approach, deltas.shortGame, deltas.putting, deltas.penalties].some(
    (value) => value != null && Number.isFinite(value),
  );
}

function componentDisplayName(component: DashboardFocusComponent): string {
  if (component === 'offTee') return 'Off the Tee';
  if (component === 'approach') return 'Approach';
  if (component === 'shortGame') return 'Short Game';
  if (component === 'putting') return 'Putting';
  if (component === 'penalties') return 'Penalties';
  return 'Untracked';
}

function componentHeadlineName(component: Exclude<DashboardFocusComponent, 'residual'>): string {
  if (component === 'penalties') return 'Penalty avoidance';
  return componentDisplayName(component);
}

function fallbackNextRoundNudge(
  component: Exclude<DashboardFocusComponent, 'residual'> | null,
  mode: SgFocusMode | 'no_data' | 'volatility',
  seedParts: Array<string | number | null | undefined> = [],
): string {
  if (mode === 'no_data') {
    return pickDashboardVariant(EARLY_GUIDANCE_NUDGES, ['nudge', 'no_data', ...seedParts]);
  }
  if (mode === 'volatility') {
    return pickDashboardVariant(VOLATILITY_GENERAL_NUDGES, ['nudge', 'volatility', ...seedParts]);
  }
  if (mode === 'balanced') {
    return pickDashboardVariant(BALANCED_STABLE_NUDGES, ['nudge', 'balanced', ...seedParts]);
  }

  if (mode === 'opportunity') {
    if (component) {
      return pickDashboardVariant(OPPORTUNITY_NUDGES[component], [
        'nudge',
        mode,
        component,
        ...seedParts,
      ]);
    }
    return pickDashboardVariant(BALANCED_STABLE_NUDGES, ['nudge', 'opportunity', 'none', ...seedParts]);
  }

  if (component) {
    return pickDashboardVariant(STRENGTH_NUDGES[component], [
      'nudge',
      mode,
      component,
      ...seedParts,
    ]);
  }
  return pickDashboardVariant(BALANCED_STABLE_NUDGES, ['nudge', 'strength', 'none', ...seedParts]);
}

function componentCoverageKey(
  component: Exclude<DashboardFocusComponent, 'residual'>,
): keyof NonNullable<DashboardOverallInsightsSummary['statCoverage']> | null {
  if (component === 'offTee') return 'fir';
  if (component === 'approach') return 'gir';
  if (component === 'shortGame') return null;
  if (component === 'putting') return 'putts';
  return 'penalties';
}

function hasEnoughCoverageForComponent(
  summary: DashboardOverallInsightsSummary,
  component: Exclude<DashboardFocusComponent, 'residual'>,
): boolean {
  if (!summary.statCoverage) return true;
  const key = componentCoverageKey(component);
  if (key == null) return true;
  return summary.statCoverage[key].tracked >= MIN_RECENT_STAT_COVERAGE_FOR_COMPONENT_FOCUS;
}

function measuredComponentCount(summary: DashboardOverallInsightsSummary): number {
  const sg = summary.sgComponentDelta;
  if (!sg) return 0;
  return [sg.offTee, sg.approach, sg.shortGame, sg.putting, sg.penalties].filter(
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
  seedParts: Array<string | number | null | undefined> = [],
): string {
  const fallback = fallbackNextRoundNudge(component, mode, seedParts);
  if (!recommendationText) return fallback;

  const normalized = recommendationText.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length > MAX_NEXT_ROUND_RECOMMENDATION_LENGTH) return fallback;
  if (normalized.includes(':')) return fallback;
  if (/\d/.test(normalized)) return fallback;
  if (/,/.test(normalized)) return fallback;
  if (/\band\b/i.test(normalized)) return fallback;
  if (/\bthen\b/i.test(normalized)) return fallback;
  if (/\btrack(?:ing)?\b/i.test(normalized)) return fallback;
  if (/\bfor\b/i.test(normalized)) return fallback;
  if ((normalized.match(/[.!?]/g) ?? []).length > 1) return fallback;
  if (/\b(goal|drill|balls?|yards?|feet|fringe|range|score)\b/i.test(normalized)) return fallback;
  if (!/^(focus on|keep|play to|choose|prioritize|take|pick|aim)\b/i.test(normalized)) return fallback;

  const withoutTrailingPunctuation = normalized.replace(/[.!?]+$/g, '').trim();
  if (!withoutTrailingPunctuation) return fallback;
  if (withoutTrailingPunctuation.split(/\s+/).length > 12) return fallback;

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
  if (sg.shortGame != null && Number.isFinite(sg.shortGame)) {
    components.push({ component: 'shortGame', delta: sg.shortGame });
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

  const withPersistenceWeight = coveredComponents.map((entry) => {
    const signal = summary.persistenceSignal;
    if (!signal || signal.component !== entry.component) {
      return { ...entry, weightedDelta: entry.delta, persistenceTier: null as PersistenceTier };
    }

    const rawTier: SharedPersistenceTier = signal.tier ?? 'none';
    const effectiveTier = downgradePersistenceTierForWeakness({
      tier: rawTier,
      currentDelta: entry.delta,
    });
    const persistenceBonus =
      rawTier === 'persistent'
        ? PERSISTENCE_PERSISTENT_BONUS
        : rawTier === 'emerging'
          ? PERSISTENCE_EMERGING_BONUS
          : 0;
    return {
      ...entry,
      weightedDelta: entry.delta - persistenceBonus,
      persistenceTier: effectiveTier === 'none' ? null : effectiveTier,
    };
  });

  const balancedState = classifyBalancedComponents({
    deltas: withPersistenceWeight.map((entry) => entry.weightedDelta),
    options: {
      opportunityThreshold: SG_OPPORTUNITY_THRESHOLD,
      strengthThreshold: SG_STRENGTH_THRESHOLD,
      tieSeparationThreshold: SG_OPPORTUNITY_SEPARATION_THRESHOLD,
      neutralBandAbs: Math.abs(SG_OPPORTUNITY_THRESHOLD) - SG_THRESHOLD_EPSILON * 10,
    },
  });
  if (balancedState.isBalanced) {
    return {
      mode: 'balanced',
      component: null,
      sgDelta: null,
      persistenceTier: null,
    };
  }

  const orderedByOpportunity = [...withPersistenceWeight].sort((a, b) => a.weightedDelta - b.weightedDelta);
  const opportunity = orderedByOpportunity[0];
  if (opportunity?.weightedDelta <= SG_OPPORTUNITY_THRESHOLD + SG_THRESHOLD_EPSILON) {
    return {
      mode: 'opportunity',
      component: opportunity.component,
      sgDelta: roundOne(opportunity.delta),
      persistenceTier: opportunity.persistenceTier,
    };
  }

  const strength = withPersistenceWeight
    .filter((entry) => entry.delta >= SG_STRENGTH_THRESHOLD - SG_THRESHOLD_EPSILON)
    .sort((a, b) => b.delta - a.delta)[0];
  if (strength) {
    return {
      mode: 'strength',
      component: strength.component,
      sgDelta: roundOne(strength.delta),
      persistenceTier: strength.persistenceTier,
    };
  }

  return {
    mode: 'balanced',
    component: null,
    sgDelta: null,
    persistenceTier: null,
  };
}

function shouldPrioritizeVolatility(
  summary: DashboardOverallInsightsSummary,
  selected: SelectedSgFocus | null,
  confidence: Exclude<DashboardFocusConfidence, null>,
): boolean {
  if (!summary.dataQualityFlags.volatileScoring) return false;
  if (summary.roundsRecent < MIN_ROUNDS_FOR_TRENDS) return false;
  if (!selected || selected.mode === 'balanced') return true;
  if (selected.mode !== 'opportunity' || selected.sgDelta == null) return false;

  const opportunityAbs = Math.abs(selected.sgDelta);
  const opportunityIsPersistent = selected.persistenceTier === 'persistent';
  if (opportunityIsPersistent && confidence === 'high') return false;
  return opportunityAbs <= VOLATILITY_OVERRIDE_MAX_COMPONENT_ABS;
}

function buildVolatilityFocus(
  summary: DashboardOverallInsightsSummary,
  isPremium: boolean,
  confidence: Exclude<DashboardFocusConfidence, null>,
): RoundFocusPayload {
  const penaltiesLeak = summary.sgComponentDelta?.penalties;
  const approachLeak = summary.sgComponentDelta?.approach;
  const seedBase = [
    'volatility',
    summary.mode,
    summary.roundsRecent,
    summary.recentWindow,
    confidence,
    roundOne(penaltiesLeak ?? null),
    roundOne(approachLeak ?? null),
  ];
  const nextRound = penaltiesLeak != null && penaltiesLeak < -0.2
    ? pickDashboardVariant(VOLATILITY_PENALTY_NUDGES, [...seedBase, 'penalties'])
    : approachLeak != null && approachLeak < -0.2
      ? pickDashboardVariant(VOLATILITY_APPROACH_NUDGES, [...seedBase, 'approach'])
      : pickDashboardVariant(VOLATILITY_GENERAL_NUDGES, [...seedBase, 'general']);
  const decisive = confidence === 'high';

  return {
    outcome: 'volatility_priority',
    focusType: 'score',
    headline: decisive
      ? pickDashboardVariant(VOLATILITY_HEADLINES_HIGH, [...seedBase, 'headline', 'high'])
      : pickDashboardVariant(VOLATILITY_HEADLINES_MED, [...seedBase, 'headline', 'medium']),
    body: isPremium
      ? decisive
        ? pickDashboardVariant(VOLATILITY_BODIES_PREMIUM_HIGH, [...seedBase, 'body', 'premium', 'high'])
        : pickDashboardVariant(VOLATILITY_BODIES_PREMIUM_MED, [...seedBase, 'body', 'premium', 'medium'])
      : pickDashboardVariant(VOLATILITY_BODIES_FREE, [...seedBase, 'body', 'free']),
    nextRound,
    component: null,
    confidence,
  };
}

function buildBalancedFocus(
  summary: DashboardOverallInsightsSummary,
  isPremium: boolean,
  confidence: Exclude<DashboardFocusConfidence, null>,
): RoundFocusPayload {
  const decisive = confidence === 'high';
  const stabilityLean = summary.dataQualityFlags.volatileScoring;
  const seedBase = [
    'balanced',
    summary.mode,
    summary.roundsRecent,
    summary.recentWindow,
    confidence,
    stabilityLean ? 'volatile' : 'stable',
  ];
  return {
    outcome: 'component_balanced',
    focusType: 'score',
    headline: decisive
      ? pickDashboardVariant(BALANCED_HEADLINES_HIGH, [...seedBase, 'headline', 'high'])
      : pickDashboardVariant(BALANCED_HEADLINES_MED, [...seedBase, 'headline', 'medium']),
    body: isPremium
      ? stabilityLean
        ? pickDashboardVariant(BALANCED_BODIES_PREMIUM_VOLATILE, [...seedBase, 'body', 'premium', 'volatile'])
        : pickDashboardVariant(BALANCED_BODIES_PREMIUM_STABLE, [...seedBase, 'body', 'premium', 'stable'])
      : stabilityLean
        ? pickDashboardVariant(BALANCED_BODIES_FREE_VOLATILE, [...seedBase, 'body', 'free', 'volatile'])
        : pickDashboardVariant(BALANCED_BODIES_FREE_STABLE, [...seedBase, 'body', 'free', 'stable']),
    nextRound: stabilityLean
      ? pickDashboardVariant(BALANCED_VOLATILE_NUDGES, [...seedBase, 'nudge', 'volatile'])
      : pickDashboardVariant(BALANCED_STABLE_NUDGES, [...seedBase, 'nudge', 'stable']),
    component: null,
    confidence,
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

function buildEarlyGuidanceFocus(
  confidence: DashboardFocusConfidence,
  seedParts: Array<string | number | null | undefined> = [],
): RoundFocusPayload {
  const seedBase = ['early_guidance', confidence, ...seedParts];
  return {
    outcome: 'early_guidance',
    focusType: 'score',
    headline: pickDashboardVariant(EARLY_GUIDANCE_HEADLINES, [...seedBase, 'headline']),
    body: pickDashboardVariant(EARLY_GUIDANCE_BODIES, [...seedBase, 'body']),
    nextRound: pickDashboardVariant(EARLY_GUIDANCE_NUDGES, [...seedBase, 'nudge']),
    component: null,
    confidence,
  };
}

function buildNoDataFocus(
  confidence: DashboardFocusConfidence,
  seedParts: Array<string | number | null | undefined> = [],
): RoundFocusPayload {
  const seedBase = ['no_data', confidence, ...seedParts];
  return {
    outcome: 'early_guidance',
    focusType: 'score',
    headline: pickDashboardVariant(EARLY_GUIDANCE_HEADLINES, [...seedBase, 'headline']),
    body: 'Log your first round to begin building your scoring baseline.',
    nextRound: pickDashboardVariant(EARLY_GUIDANCE_NUDGES, [...seedBase, 'nudge']),
    component: null,
    confidence,
  };
}

function buildScoreOnlyFocus(
  summary: DashboardOverallInsightsSummary,
  isPremium: boolean,
  confidence: DashboardFocusConfidence,
): RoundFocusPayload {
  if (summary.roundsRecent <= 1 || summary.scoreTrendDelta == null) {
    return buildEarlyGuidanceFocus(confidence, [
      'score_only',
      summary.mode,
      summary.roundsRecent,
      summary.recentWindow,
      roundOne(summary.scoreTrendDelta),
    ]);
  }

  const delta = summary.scoreTrendDelta ?? 0;
  const outcome = scoreFocusOutcome(summary);
  const seedBase = [
    'score_only',
    summary.mode,
    summary.roundsRecent,
    summary.recentWindow,
    confidence,
    roundOne(summary.scoreTrendDelta),
    outcome,
  ];
  let headline: string = pickDashboardVariant(SCORE_ONLY_STABLE_HEADLINES, [...seedBase, 'stable', 'headline']);
  let body: string = isPremium
    ? pickDashboardVariant(SCORE_ONLY_STABLE_BODIES_PREMIUM, [...seedBase, 'stable', 'body', 'premium'])
    : confidence === 'medium'
      ? pickDashboardVariant(SCORE_ONLY_STABLE_BODIES_FREE_MED, [...seedBase, 'stable', 'body', 'free', 'medium'])
      : pickDashboardVariant(SCORE_ONLY_STABLE_BODIES_FREE_LOW, [...seedBase, 'stable', 'body', 'free', 'low']);
  let nextRound: string = pickDashboardVariant(SCORE_ONLY_STABLE_NUDGES, [...seedBase, 'stable', 'nudge']);

  if (outcome === 'score_only_improving') {
    headline = pickDashboardVariant(SCORE_ONLY_IMPROVING_HEADLINES, [...seedBase, 'improving', 'headline']);
    body = isPremium
      ? `Your scoring is about ${formatOneDecimal(Math.abs(delta))} strokes better than usual.`
      : pickDashboardVariant(SCORE_ONLY_IMPROVING_BODIES_FREE, [...seedBase, 'improving', 'body', 'free']);
    nextRound = pickDashboardVariant(SCORE_ONLY_IMPROVING_NUDGES, [...seedBase, 'improving', 'nudge']);
  } else if (outcome === 'score_only_worsening') {
    headline = pickDashboardVariant(SCORE_ONLY_WORSENING_HEADLINES, [...seedBase, 'worsening', 'headline']);
    body = isPremium
      ? `Your scoring is about ${formatOneDecimal(Math.abs(delta))} strokes worse than usual.`
      : confidence === 'medium'
        ? pickDashboardVariant(SCORE_ONLY_WORSENING_BODIES_FREE_MED, [...seedBase, 'worsening', 'body', 'free', 'medium'])
        : pickDashboardVariant(SCORE_ONLY_WORSENING_BODIES_FREE_LOW, [...seedBase, 'worsening', 'body', 'free', 'low']);
    nextRound = pickDashboardVariant(SCORE_ONLY_WORSENING_NUDGES, [...seedBase, 'worsening', 'nudge']);
  }

  return {
    outcome,
    focusType: 'score',
    headline,
    body,
    nextRound,
    component: null,
    confidence,
  };
}

function buildSgDrivenFocus(
  summary: DashboardOverallInsightsSummary,
  selected: SelectedSgFocus,
  isPremium: boolean,
  confidence: DashboardFocusConfidence,
): RoundFocusPayload {
  if (selected.mode === 'balanced' || !selected.component || selected.sgDelta == null) {
    return buildBalancedFocus(summary, isPremium, resolveFocusConfidence(confidence));
  }

  const componentLabel = componentHeadlineName(selected.component);
  const scoreOutcome = scoreFocusOutcome(summary);
  const decisive = confidence === 'high';
  const persistenceTier = selected.persistenceTier;
  const isRecurring = persistenceTier === 'persistent';
  const tinyDelta = isTinyDelta(selected.sgDelta);

  const headline = (() => {
    if (selected.mode === 'opportunity') {
      if (selected.component === 'penalties') {
        if (decisive) {
          return isRecurring
            ? 'Penalty avoidance is your clearest recurring way to stabilize scoring.'
            : 'Penalty avoidance is the clearest way to stabilize scoring right now.';
        }
        return 'Penalty avoidance is a likely way to steady scores.';
      }
      return decisive
        ? isRecurring
          ? `${componentLabel} is the clearest recurring scoring focus right now.`
          : `${componentLabel} is the clearest scoring focus right now.`
        : `${componentLabel} is the biggest opportunity right now.`;
    }
    return scoreOutcome === 'score_only_worsening'
      ? `${componentLabel} is your strongest area.`
      : `${componentLabel} is driving your improvement.`;
  })();

  const body = (() => {
    if (selected.mode === 'opportunity') {
      if (isPremium) {
        if (tinyDelta) {
          if (selected.component === 'penalties') {
            return 'Avoiding one high-cost mistake per round could lower scoring variance.';
          }
          return isRecurring
            ? `${componentLabel} has been a small but recurring scoring leak.`
            : `${componentLabel} has quietly limited scoring consistency.`;
        }
        if (decisive) {
          return isRecurring
            ? `${componentLabel} is repeatedly costing about ${formatAboutSg(selected.sgDelta)} strokes per round.`
            : `${componentLabel} is costing about ${formatAboutSg(selected.sgDelta)} strokes per round.`;
        }
        return `You're losing about ${formatAboutSg(selected.sgDelta)} strokes per round.`;
      }
      if (selected.component === 'penalties') {
        return 'One avoidable mistake is still adding strokes.';
      }
      return decisive && isRecurring
        ? `${componentLabel} is repeatedly costing strokes.`
        : `${componentLabel} is costing you the most strokes.`;
    }

    if (isPremium) {
      if (tinyDelta) return `${componentLabel} is a modest scoring strength right now.`;
      return decisive
        ? `${componentLabel} is reliably gaining about ${formatAboutSg(selected.sgDelta)} strokes per round.`
        : `${componentLabel} is gaining about ${formatAboutSg(selected.sgDelta)} strokes per round.`;
    }
    return `${componentLabel} is helping your score.`;
  })();

  return {
    outcome: selected.mode === 'opportunity' ? 'component_opportunity' : 'component_strength',
    focusType: 'component',
    headline,
    body,
    nextRound: compactNextRoundNudge(summary.recommendationText, selected.component, selected.mode, [
      'component',
      selected.mode,
      summary.mode,
      summary.roundsRecent,
      summary.recentWindow,
      summary.confidence,
      selected.component,
      roundOne(selected.sgDelta),
      selected.persistenceTier,
      scoreOutcome,
    ]),
    component: selected.component,
    confidence,
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
        shortGame: deltaOrNull(
          sgComponents.recentAvg?.shortGame,
          sgComponents.baselineAvg?.shortGame,
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
  const rawPersistence = payload.sg?.components?.worstComponentFrequencyRecent;
  const persistenceCount = Math.max(0, Math.floor(toNumberOrNull(rawPersistence?.count) ?? 0));
  const persistenceWindow = Math.max(0, Math.floor(toNumberOrNull(rawPersistence?.window) ?? 0));
  const persistenceComponent = mapPersistedComponent(rawPersistence?.component);
  const persistenceTierResolved = resolvePersistenceTierFromFrequency(
    persistenceCount,
    persistenceWindow,
    {
      emergingMinCount: PERSISTENCE_EMERGING_MIN_COUNT,
      persistentMinCount: PERSISTENCE_PERSISTENT_MIN_COUNT,
    },
  );
  const persistenceTier: PersistenceTier =
    persistenceTierResolved === 'none' ? null : persistenceTierResolved;
  const volatilitySignal = classifyVolatilitySignal({
    consistencyLabel: modePayload.consistency?.label,
    stdDev: consistencySpread,
    options: {
      strongStdDev: VOLATILE_STDDEV_THRESHOLD,
      moderateStdDev: VOLATILE_STDDEV_THRESHOLD - 1,
    },
  });

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
    persistenceSignal:
      persistenceTier == null && !persistenceComponent
        ? null
        : {
            component: persistenceComponent,
            count: persistenceCount,
            window: persistenceWindow,
            tier: persistenceTier,
          },
    dataQualityFlags: {
      insufficientRounds: roundsRecent < MIN_ROUNDS_FOR_TRENDS,
      missingScoreTrend: scoreTrendDelta == null,
      combinedNeedsMoreNineHoleRounds,
      missingComponentData: !hasAnyMeasuredComponentData(sgDeltas),
      partialRecentStats: missingRecentStatCount > 0,
      residualDominant,
      volatileScoring: volatilitySignal.severity === 'strong',
    },
  };
}

export function buildRoundFocusState(
  summary: DashboardOverallInsightsSummary | null,
  isPremium: boolean,
  isLimited: boolean,
): RoundFocusState {
  if (!summary || summary.roundsRecent <= 0) {
    const fallbackFocus = buildNoDataFocus('low', [
      'fallback',
      summary?.mode ?? 'combined',
      summary?.roundsRecent ?? 0,
      summary?.recentWindow ?? 0,
      summary?.lastUpdatedAt ?? 'none',
    ]);
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

  const resolvedConfidence = resolveFocusConfidence(summary.confidence);
  if (resolvedConfidence === 'low') {
    if (shouldUseMatureScoreOnlyForLowConfidence(summary)) {
      const scoreOnlyFocus = buildScoreOnlyFocus(summary, isPremium, 'medium');
      if (!isPremium) {
        return {
          kind: 'READY_FREE',
          focus: scoreOnlyFocus,
          isLimited,
        };
      }
      return {
        kind: 'READY_PREMIUM',
        focus: scoreOnlyFocus,
      };
    }
    const fallbackFocus = buildEarlyGuidanceFocus('low', [
      'low_confidence',
      summary.mode,
      summary.roundsRecent,
      summary.recentWindow,
      roundOne(summary.scoreTrendDelta),
      summary.lastUpdatedAt,
    ]);
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
  const sgFocus = selectSgFocus(summary);
  if (shouldPrioritizeVolatility(summary, sgFocus, resolvedConfidence)) {
    const volatilityFocus = buildVolatilityFocus(summary, isPremium, resolvedConfidence);
    if (!isPremium) {
      return {
        kind: 'READY_FREE',
        focus: volatilityFocus,
        isLimited,
      };
    }
    return {
      kind: 'READY_PREMIUM',
      focus: volatilityFocus,
    };
  }
  const shouldPreferScoreOnly =
    summary.roundsRecent <= 1 ||
    summary.scoreTrendDelta == null;

  if (!sgFocus || shouldPreferScoreOnly) {
    const fallbackFocus = buildScoreOnlyFocus(summary, isPremium, resolvedConfidence);
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

  const focus = buildSgDrivenFocus(summary, sgFocus, isPremium, resolvedConfidence);

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
