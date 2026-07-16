import {
  buildComponentTrendEvidence,
  isSgComponentAvailable,
  componentSeparation,
  normalizeTrendValue,
  selectEligibleTrendRounds,
  TREND_EVIDENCE_COMPONENTS,
  type ComponentTrendEvidence,
  type TrendEvidenceComponent,
  type TrendEvidenceRound,
} from '@/lib/insights/trendEvidence';
import {
  GAME_TRENDS_CORE_ROUND_LIMIT,
  GAME_TRENDS_MODE_THRESHOLDS,
  GAME_TRENDS_RECENT_PROFILE_WINDOW,
} from './config';
import { resolveCanonicalStability } from './stability';
import { resolveScoringMomentum } from './momentum';
import type {
  CanonicalProfileConclusion,
  ComponentChange,
  GameProfileBuildingReason,
  GameProfileState,
  GameTrendsConfidence,
  GameTrendsMode,
  GameTrendsV2Canonical,
  ProfileMaturity,
  RecentFormEvidence,
  RecentFormState,
} from './types';

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizedScore(round: TrendEvidenceRound, mode: GameTrendsMode): number {
  return mode === 'combined' && round.holes === 9 ? round.score * 2 : round.score;
}

function normalizedToPar(round: TrendEvidenceRound, mode: GameTrendsMode): number | null {
  return normalizeTrendValue(round.toPar, round.holes, mode);
}

function range(values: number[]): number | null {
  if (!values.length) return null;
  return Math.max(...values) - Math.min(...values);
}

function recentFormConfidence(count: number): GameTrendsConfidence {
  if (count <= 5) return 'building';
  if (count <= 19) return 'moderate';
  return 'strong';
}

function resolveRecentForm(rounds: TrendEvidenceRound[], mode: GameTrendsMode): GameTrendsV2Canonical['recentForm'] {
  const count = rounds.length;
  const scores = rounds.map((round) => normalizedScore(round, mode));
  const toPars = rounds.map((round) => normalizedToPar(round, mode)).filter((value): value is number => value != null);
  let recent = rounds;
  let baseline: TrendEvidenceRound[] = [];
  let state: RecentFormState = 'unavailable';
  let maturity: GameTrendsV2Canonical['recentForm']['maturity'] = 'none';

  if (count === 1) {
    state = 'first_round_snapshot';
    maturity = 'snapshot';
  } else if (count === 2) {
    state = 'early_scoring_level';
    maturity = 'early_level';
  } else if (count === 3) {
    state = 'current_form';
    maturity = 'current_form';
  } else if (count >= 4 && count <= 9) {
    if (count === 4) {
      recent = rounds.slice(0, 2);
      baseline = rounds.slice(2, 4);
    } else if (count === 5) {
      recent = rounds.slice(0, 3);
      baseline = rounds.slice(3, 5);
    } else {
      recent = rounds.slice(0, 3);
      baseline = rounds.slice(3, 6);
    }
    maturity = 'early_comparison';
    const delta = (average(recent.map((round) => normalizedScore(round, mode))) ?? 0) -
      (average(baseline.map((round) => normalizedScore(round, mode))) ?? 0);
    const threshold = GAME_TRENDS_MODE_THRESHOLDS[mode].earlyScoreNear;
    state = Math.abs(delta) <= threshold ? 'early_similar' : delta < 0 ? 'early_better' : 'early_worse';
  } else if (count >= 10) {
    recent = rounds.slice(0, 5);
    baseline = rounds.slice(5, count >= 20 ? 20 : Math.min(count, 19));
    maturity = 'established';
    const delta = (average(recent.map((round) => normalizedScore(round, mode))) ?? 0) -
      (average(baseline.map((round) => normalizedScore(round, mode))) ?? 0);
    const threshold = GAME_TRENDS_MODE_THRESHOLDS[mode].matureScoreNear;
    state = Math.abs(delta) <= threshold
      ? 'near_established'
      : delta < 0
        ? 'better_than_established'
        : 'worse_than_established';
  }

  const recentScores = recent.map((round) => normalizedScore(round, mode));
  const recentToPars = recent
    .map((round) => normalizedToPar(round, mode))
    .filter((value): value is number => value != null);
  const baselineAverage = average(baseline.map((round) => normalizedScore(round, mode)));
  const recentAverage = average(recentScores);
  const evidence: RecentFormEvidence = {
    recentCount: recent.length,
    baselineCount: baseline.length,
    averageScore: round1(recentAverage),
    averageToPar: round1(average(recentToPars)),
    baselineAverageScore: round1(baselineAverage),
    deltaVsBaseline: round1(recentAverage != null && baselineAverage != null ? recentAverage - baselineAverage : null),
    bestScore: recentScores.length ? Math.min(...recentScores) : null,
    scoreRange: round1(range(recentScores)),
    latestScore: scores[0] ?? null,
    latestToPar: toPars.length && rounds[0] ? normalizedToPar(rounds[0], mode) : null,
    momentum: resolveScoringMomentum(scores, mode),
  };

  return { state, confidence: recentFormConfidence(count), maturity, evidence };
}

function resolveStability(rounds: TrendEvidenceRound[], mode: GameTrendsMode): GameTrendsV2Canonical['stability'] {
  const values = rounds
    .slice(0, 5)
    .map((round) => normalizedToPar(round, mode))
    .filter((value): value is number => value != null);
  return resolveCanonicalStability({
    normalizedToParValues: values,
    mode,
    hasEligibleRounds: rounds.length > 0,
  });
}

function evidenceSpanDays(rounds: TrendEvidenceRound[], component: TrendEvidenceComponent): number | null {
  const dates = rounds
    .filter((round) => isSgComponentAvailable({
      value: round.components[component],
      eligible: component !== 'short_game' || round.shortGameOpportunityEligible,
    }))
    .map((round) => new Date(round.date).getTime())
    .filter(Number.isFinite);
  if (dates.length < 2) return null;
  return Math.floor((Math.max(...dates) - Math.min(...dates)) / 86_400_000);
}

function resolveChange(args: {
  role: 'strength' | 'opportunity';
  recentAverage: number;
  baselineAverage: number | null;
  threshold: number;
}): { change: ComponentChange; delta: number | null } {
  if (args.baselineAverage == null) return { change: 'baseline_unavailable', delta: null };
  const delta = args.recentAverage - args.baselineAverage;
  if (Math.abs(delta) < args.threshold) return { change: 'stable', delta };
  if (args.role === 'strength') return { change: delta < 0 ? 'softening' : 'improving', delta };
  return { change: delta > 0 ? 'improving' : 'worsening', delta };
}

function hasSustainedSupport(args: {
  role: 'strength' | 'opportunity';
  component: TrendEvidenceComponent;
  allEvidence: Record<TrendEvidenceComponent, ComponentTrendEvidence>;
  rounds: TrendEvidenceRound[];
}): boolean {
  const evidence = args.allEvidence[args.component];
  const span = evidenceSpanDays(args.rounds, args.component);
  if (span == null || span < 60 || evidence.trackedCount < 10) return false;
  const signCount = args.role === 'strength' ? evidence.positiveCount : evidence.negativeCount;
  const rankCount = args.role === 'strength' ? evidence.rankedHighestCount : evidence.rankedLowestCount;
  const correctAverage = args.role === 'strength'
    ? (evidence.average ?? 0) > 0
    : (evidence.average ?? 0) < 0;
  return correctAverage && signCount >= Math.ceil(evidence.trackedCount * 0.6) && rankCount >= Math.ceil(evidence.trackedCount * 0.5);
}

function buildConclusion(args: {
  role: 'strength' | 'opportunity';
  selected: ComponentTrendEvidence;
  separation: number;
  recentWindowCount: number;
  baselineAverage: number | null;
  allEvidence: Record<TrendEvidenceComponent, ComponentTrendEvidence>;
  rounds: TrendEvidenceRound[];
  totalEligibleRounds: number;
  mode: GameTrendsMode;
  provisional: boolean;
}): CanonicalProfileConclusion {
  const thresholds = GAME_TRENDS_MODE_THRESHOLDS[args.mode];
  const strong = !args.provisional &&
    args.selected.trackedCount === 5 &&
    (args.role === 'strength' ? args.selected.positiveCount : args.selected.negativeCount) >= 4 &&
    (args.role === 'strength' ? args.selected.rankedHighestCount : args.selected.rankedLowestCount) >= 4 &&
    args.separation >= thresholds.strongSeparation;
  const confidence: GameTrendsConfidence = args.provisional ? 'building' : strong ? 'strong' : 'moderate';
  const change = resolveChange({
    role: args.role,
    recentAverage: args.selected.average as number,
    baselineAverage: args.baselineAverage,
    threshold: thresholds.materialBaselineChange,
  });
  let maturity: ProfileMaturity = args.provisional ? 'provisional' : 'recent_supported';
  if (!args.provisional && args.totalEligibleRounds >= 10 && args.baselineAverage != null) maturity = 'established';
  if (strong && hasSustainedSupport({ role: args.role, component: args.selected.component, allEvidence: args.allEvidence, rounds: args.rounds })) {
    maturity = 'sustained';
  }
  return {
    component: args.selected.component,
    confidence,
    change: change.change,
    maturity,
    evidence: {
      recentWindowCount: args.recentWindowCount,
      trackedRecentCount: args.selected.trackedCount,
      rankedHighestCount: args.selected.rankedHighestCount,
      rankedLowestCount: args.selected.rankedLowestCount,
      evidenceSpanDays: evidenceSpanDays(args.rounds, args.selected.component),
      recentSgAverage: args.selected.average as number,
      baselineSgAverage: args.baselineAverage,
      sgDelta: change.delta,
      positiveRoundCount: args.selected.positiveCount,
      negativeRoundCount: args.selected.negativeCount,
      separation: args.separation,
    },
  };
}

function resolveGameProfile(rounds: TrendEvidenceRound[], mode: GameTrendsMode): GameTrendsV2Canonical['gameProfile'] {
  if (!rounds.length) {
    return { state: 'unavailable', confidence: 'building', strength: null, opportunity: null, buildingReason: null };
  }
  if (rounds.length < 3) {
    return { state: 'building', confidence: 'building', strength: null, opportunity: null, buildingReason: 'insufficient_rounds' };
  }
  const recent = rounds.slice(0, GAME_TRENDS_RECENT_PROFILE_WINDOW);
  const baseline = rounds.slice(5, 20);
  const recentEvidence = buildComponentTrendEvidence(recent, mode);
  const baselineEvidence = buildComponentTrendEvidence(baseline, mode);
  const allEvidence = buildComponentTrendEvidence(rounds.slice(0, 20), mode);
  const provisionalWindow = recent.length === 3;
  const minimumTracked = provisionalWindow ? 3 : 4;
  const adequatelyTracked = TREND_EVIDENCE_COMPONENTS
    .map((component) => recentEvidence[component])
    .filter((evidence) => evidence.trackedCount >= minimumTracked && evidence.average != null);

  if (adequatelyTracked.length < 4) {
    const anyUsable = TREND_EVIDENCE_COMPONENTS.some((component) => recentEvidence[component].trackedCount > 0);
    return {
      state: 'building',
      confidence: 'building',
      strength: null,
      opportunity: null,
      buildingReason: anyUsable ? 'insufficient_coverage' : 'insufficient_quality',
    };
  }

  const thresholds = GAME_TRENDS_MODE_THRESHOLDS[mode];
  const strongest = [...adequatelyTracked].sort((left, right) => (right.average as number) - (left.average as number))[0];
  const weakest = [...adequatelyTracked].sort((left, right) => (left.average as number) - (right.average as number))[0];
  const strengthSeparation = componentSeparation(strongest, adequatelyTracked, 'highest') ?? 0;
  const opportunitySeparation = componentSeparation(weakest, adequatelyTracked, 'lowest') ?? 0;
  const signRequirement = provisionalWindow ? 2 : 3;
  const rankRequirement = provisionalWindow ? 2 : 3;
  const strengthValid = (strongest.average as number) >= thresholds.materialComponent &&
    strongest.positiveCount >= signRequirement &&
    strongest.rankedHighestCount >= rankRequirement &&
    strengthSeparation >= thresholds.moderateSeparation;
  const opportunityValid = (weakest.average as number) <= -thresholds.materialComponent &&
    weakest.negativeCount >= signRequirement &&
    weakest.rankedLowestCount >= rankRequirement &&
    opportunitySeparation >= thresholds.moderateSeparation;

  const strength = strengthValid ? buildConclusion({
    role: 'strength',
    selected: strongest,
    separation: strengthSeparation,
    recentWindowCount: recent.length,
    baselineAverage: baselineEvidence[strongest.component].trackedCount >= 5 ? baselineEvidence[strongest.component].average : null,
    allEvidence,
    rounds,
    totalEligibleRounds: rounds.length,
    mode,
    provisional: provisionalWindow,
  }) : null;
  const opportunity = opportunityValid ? buildConclusion({
    role: 'opportunity',
    selected: weakest,
    separation: opportunitySeparation,
    recentWindowCount: recent.length,
    baselineAverage: baselineEvidence[weakest.component].trackedCount >= 5 ? baselineEvidence[weakest.component].average : null,
    allEvidence,
    rounds,
    totalEligibleRounds: rounds.length,
    mode,
    provisional: provisionalWindow,
  }) : null;

  let state: GameProfileState = 'balanced';
  if (strength && opportunity) state = 'strength_and_opportunity';
  else if (strength) state = 'strength_only';
  else if (opportunity) state = 'opportunity_only';
  const conclusions = [strength, opportunity].filter((entry): entry is CanonicalProfileConclusion => entry != null);
  const confidence: GameTrendsConfidence = conclusions.length
    ? conclusions.every((entry) => entry.confidence === 'strong')
      ? 'strong'
      : conclusions.every((entry) => entry.confidence === 'building')
        ? 'building'
        : 'moderate'
    : adequatelyTracked.length >= 4 && adequatelyTracked.every((entry) => entry.trackedCount === 5)
      ? 'strong'
      : 'moderate';

  return { state, confidence, strength, opportunity, buildingReason: null };
}

function aggregateConfidence(args: {
  recentForm: GameTrendsV2Canonical['recentForm'];
  gameProfile: GameTrendsV2Canonical['gameProfile'];
  stability: GameTrendsV2Canonical['stability'];
}): GameTrendsConfidence {
  const confidences: GameTrendsConfidence[] = [args.recentForm.confidence, args.stability.confidence];
  if (args.gameProfile.strength) confidences.push(args.gameProfile.strength.confidence);
  if (args.gameProfile.opportunity) confidences.push(args.gameProfile.opportunity.confidence);
  if (!args.gameProfile.strength && !args.gameProfile.opportunity) confidences.push(args.gameProfile.confidence);
  const supported = confidences.filter((confidence) => confidence !== 'building').length;
  if (supported < 2) return 'building';
  if (confidences.every((confidence) => confidence === 'strong')) return 'strong';
  return 'moderate';
}

export function resolveGameTrendsMode(args: {
  rounds: TrendEvidenceRound[];
  mode: GameTrendsMode;
  now?: Date;
}): GameTrendsV2Canonical {
  const rounds = selectEligibleTrendRounds({
    rounds: args.rounds,
    mode: args.mode,
    now: args.now,
    limit: GAME_TRENDS_CORE_ROUND_LIMIT,
  });
  const recentForm = resolveRecentForm(rounds, args.mode);
  const gameProfile = resolveGameProfile(rounds, args.mode);
  const stability = resolveStability(rounds, args.mode);
  return {
    version: 2,
    mode: args.mode,
    recentForm,
    gameProfile,
    stability,
    confidence: aggregateConfidence({ recentForm, gameProfile, stability }),
  };
}

export function resolveAllGameTrends(args: { rounds: TrendEvidenceRound[]; now?: Date }): Record<GameTrendsMode, GameTrendsV2Canonical> {
  return {
    combined: resolveGameTrendsMode({ ...args, mode: 'combined' }),
    '9': resolveGameTrendsMode({ ...args, mode: '9' }),
    '18': resolveGameTrendsMode({ ...args, mode: '18' }),
  };
}

export function getGameProfileBuildingReason(profile: GameTrendsV2Canonical['gameProfile']): GameProfileBuildingReason {
  return profile.buildingReason;
}
