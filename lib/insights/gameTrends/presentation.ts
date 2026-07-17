import {
  gameTrendsDtoSchema,
  type CanonicalProfileConclusion,
  type GameProfileConclusionDto,
  type GameTrendsTier,
  type GameTrendsV2Canonical,
  type GameTrendsV2Dto,
  type ScoringLevel,
  type ScoringOutlookStatus,
} from './types';

const COMPONENT_LABELS = {
  off_the_tee: 'Off the Tee',
  approach: 'Approach',
  short_game: 'Short Game',
  putting: 'Putting',
  penalties: 'Penalties',
} as const;

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function projectConclusion(
  conclusion: CanonicalProfileConclusion | null,
  role: 'strength' | 'opportunity',
  tier: GameTrendsTier,
): GameProfileConclusionDto | null {
  if (!conclusion) return null;
  const common = {
    recentWindowCount: conclusion.evidence.recentWindowCount,
    trackedRecentCount: conclusion.evidence.trackedRecentCount,
    rankedHighestCount: conclusion.evidence.rankedHighestCount,
    rankedLowestCount: conclusion.evidence.rankedLowestCount,
    change: conclusion.change,
    evidenceSpanDays: conclusion.evidence.evidenceSpanDays,
  };
  const evidence: GameProfileConclusionDto['evidence'] = tier === 'premium'
    ? {
        kind: 'premium',
        ...common,
        recentSgAverage: round1(conclusion.evidence.recentSgAverage),
        baselineSgAverage: conclusion.evidence.baselineSgAverage == null ? null : round1(conclusion.evidence.baselineSgAverage),
        sgDelta: conclusion.evidence.sgDelta == null ? null : round1(conclusion.evidence.sgDelta),
        positiveRoundCount: conclusion.evidence.positiveRoundCount,
        negativeRoundCount: conclusion.evidence.negativeRoundCount,
        separation: round1(conclusion.evidence.separation),
      }
    : { kind: 'free_safe', ...common };
  return {
    ...conclusion,
    evidence,
    copyKey: `profile.${role}.${conclusion.maturity}.${conclusion.change}`,
    analyticsKey: role,
  };
}

export function projectGameTrendsForViewer(
  canonical: GameTrendsV2Canonical,
  tier: GameTrendsTier,
): GameTrendsV2Dto {
  const dto: GameTrendsV2Dto = {
    version: 2,
    tier,
    mode: canonical.mode,
    recentForm: {
      ...canonical.recentForm,
      copyKey: `recent_form.${canonical.recentForm.state}`,
      analyticsKey: 'recent_form',
    },
    gameProfile: {
      ...canonical.gameProfile,
      copyKey: `profile.${canonical.gameProfile.state}`,
      analyticsKey: 'game_profile',
      strength: projectConclusion(canonical.gameProfile.strength, 'strength', tier),
      opportunity: projectConclusion(canonical.gameProfile.opportunity, 'opportunity', tier),
    },
    stability: {
      ...canonical.stability,
      copyKey: `stability.${canonical.stability.state}`,
      analyticsKey: 'stability',
    },
    confidence: canonical.confidence,
  };
  return gameTrendsDtoSchema.parse(dto);
}

function formatNumber(value: number | null, digits = 1): string {
  if (value == null) return '-';
  return value.toFixed(digits).replace(/\.0$/, '');
}

function formatSigned(value: number | null): string {
  if (value == null) return '-';
  if (value === 0) return 'even par';
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatStrokeCount(value: number | null): string {
  const formatted = formatNumber(value);
  const displayedValue = Number(formatted);
  return `${formatted} ${Math.abs(displayedValue) === 1 ? 'stroke' : 'strokes'}`;
}

export type GameTrendCopy = { conclusion: string; supporting: string | null };
export type ScoringOutlookPresentation = {
  status: ScoringOutlookStatus;
  label: string;
  tone: 'up' | 'flat' | 'warn' | 'down' | 'none';
};

function scoringLevel(trends: GameTrendsV2Dto): ScoringLevel {
  if (trends.recentForm.state === 'better_than_established') return 'better';
  if (trends.recentForm.state === 'near_established') return 'near';
  if (trends.recentForm.state === 'worse_than_established') return 'higher';
  return 'building';
}

export function composeScoringOutlookPresentation(
  trends: GameTrendsV2Dto,
): ScoringOutlookPresentation {
  const level = scoringLevel(trends);
  const momentum = trends.recentForm.evidence.momentum;
  if (level === 'building' || momentum.state === 'unavailable' || momentum.deltaVsPrevious == null) {
    return { status: 'building', label: 'Still Building', tone: 'none' };
  }

  if (level === 'better') {
    if (momentum.state === 'improving') {
      return { status: 'improving', label: 'Improving', tone: 'up' };
    }
    if (momentum.state === 'steady') {
      return { status: 'holding', label: 'Holding', tone: 'flat' };
    }
    return { status: 'softening', label: 'Softening', tone: 'warn' };
  }

  if (level === 'near') {
    if (momentum.state === 'improving') {
      return { status: 'improving', label: 'Improving', tone: 'up' };
    }
    if (momentum.state === 'steady') {
      return { status: 'steady', label: 'Steady', tone: 'flat' };
    }
    return { status: 'trending_higher', label: 'Trending Higher', tone: 'warn' };
  }

  if (momentum.state === 'improving') {
    return { status: 'recovering', label: 'Recovering', tone: 'up' };
  }
  if (momentum.state === 'steady') {
    return { status: 'steady', label: 'Steady', tone: 'flat' };
  }
  return { status: 'worsening', label: 'Worsening', tone: 'down' };
}

export function composeRecentFormCopy(trends: GameTrendsV2Dto): GameTrendCopy {
  const { state, evidence } = trends.recentForm;
  if (state === 'unavailable') return { conclusion: 'Add your first round to start building Game Trends.', supporting: null };
  if (state === 'first_round_snapshot') {
    return {
      conclusion: `Your first-round snapshot is ${formatNumber(evidence.latestScore, 0)}${evidence.latestToPar == null ? '' : ` (${formatSigned(evidence.latestToPar)})`}.`,
      supporting: 'This is a starting point, not a trend yet.',
    };
  }
  if (state === 'early_scoring_level' || state === 'current_form') {
    return {
      conclusion: `Your recent rounds are averaging ${formatNumber(evidence.averageScore)}${evidence.averageToPar == null ? '' : ` (${formatSigned(evidence.averageToPar)})`}.`,
      supporting: `Your best score is ${formatNumber(evidence.bestScore, 0)}, with a ${formatNumber(evidence.scoreRange)}-stroke range.`,
    };
  }
  if (state.startsWith('early_')) {
    const direction = state === 'early_better' ? 'better' : state === 'early_worse' ? 'higher' : 'similar';
    const comparison = evidence.baselineAverageScore == null ? '' : ` compared with ${formatNumber(evidence.baselineAverageScore)}`;
    return {
      conclusion: `Your latest scores are ${direction}, averaging ${formatNumber(evidence.averageScore)}${comparison}.`,
      supporting: `This early signal is based on ${evidence.recentCount + evidence.baselineCount} rounds and may change as you continue playing.`,
    };
  }
  const direction = state === 'better_than_established' ? 'better than' : state === 'worse_than_established' ? 'higher than' : 'close to';
  return {
    conclusion: `Your recent scoring has been ${direction} your usual level.`,
    supporting: `Your latest ${evidence.recentCount} rounds average ${formatNumber(evidence.averageScore)} compared with ${formatNumber(evidence.baselineAverageScore)} across the previous ${evidence.baselineCount}.`,
  };
}

function profileOpening(conclusion: GameProfileConclusionDto, role: 'strength' | 'opportunity'): string {
  const label = COMPONENT_LABELS[conclusion.component];
  const isPlural = conclusion.component === 'penalties';
  if (role === 'strength') {
    if (conclusion.maturity === 'provisional') return `${label} ${isPlural ? 'are' : 'is'} emerging as the strongest part of your game.`;
    if (conclusion.maturity === 'sustained') return `${label} ${isPlural ? 'have' : 'has'} consistently been the strongest part of your game over the last several months.`;
    if (conclusion.maturity === 'established') return `${label} ${isPlural ? 'have' : 'has'} consistently been the strongest part of your game.`;
    return `${label} ${isPlural ? 'have' : 'has'} been the strongest part of your game across recent rounds.`;
  }
  if (conclusion.maturity === 'provisional') return `${label} ${isPlural ? 'are' : 'is'} emerging as your clearest scoring opportunity.`;
  if (conclusion.maturity === 'sustained') return `${label} ${isPlural ? 'have' : 'has'} consistently offered the biggest opportunity to lower your scores over the last several months.`;
  if (conclusion.maturity === 'established') return `${label} ${isPlural ? 'continue' : 'continues'} to offer the biggest opportunity to lower your scores.`;
  return `${label} ${isPlural ? 'have' : 'has'} offered the biggest opportunity to lower your scores across recent rounds.`;
}

export function composeProfileConclusionCopy(
  conclusion: GameProfileConclusionDto,
  role: 'strength' | 'opportunity',
): GameTrendCopy {
  const opening = profileOpening(conclusion, role);
  const evidence = conclusion.evidence;
  if (evidence.kind === 'free_safe') {
    const rankCount = role === 'strength' ? evidence.rankedHighestCount : evidence.rankedLowestCount;
    const rankLabel = role === 'strength' ? 'best-performing' : 'lowest-performing';
    return {
      conclusion: opening,
      supporting: `It ranked as your ${rankLabel} area in ${rankCount} of ${evidence.trackedRecentCount} tracked rounds.`,
    };
  }
  const signedAverage = `${evidence.recentSgAverage >= 0 ? '+' : ''}${formatNumber(evidence.recentSgAverage)}`;
  const displayedAverage = Number(formatNumber(evidence.recentSgAverage));
  const gainNoun = Math.abs(displayedAverage) === 1 ? 'stroke' : 'strokes';
  const supporting = role === 'strength'
    ? `You averaged ${signedAverage} ${gainNoun} gained per round over your last ${evidence.trackedRecentCount} tracked rounds.`
    : `You lost an average of ${formatStrokeCount(Math.abs(evidence.recentSgAverage))} per round over your last ${evidence.trackedRecentCount} tracked rounds.`;
  return { conclusion: opening, supporting };
}

export function composeGameProfileFallbackCopy(trends: GameTrendsV2Dto): GameTrendCopy {
  const profile = trends.gameProfile;
  if (profile.state === 'balanced') {
    return {
      conclusion: 'No single part of your game is consistently helping or hurting your scores right now.',
      supporting: 'The differences between your tracked areas have not been consistent enough for one to stand apart.',
    };
  }
  if (profile.state === 'unavailable') return { conclusion: 'Your Game Profile will take shape after you log a round.', supporting: null };
  const reason = profile.buildingReason === 'insufficient_quality'
    ? 'Play a few more complete tracked rounds to identify your strengths and biggest opportunities.'
    : 'Play a few more tracked rounds to identify your strengths and biggest opportunities.';
  return { conclusion: reason, supporting: null };
}

export function composeStabilityCopy(trends: GameTrendsV2Dto): GameTrendCopy {
  const { state, evidence } = trends.stability;
  if (state === 'unavailable') return { conclusion: 'Stability will appear after you log a round.', supporting: null };
  if (state === 'building') return {
    conclusion: 'There are not enough rounds yet to measure your scoring consistency.',
    supporting: `GolfIQ needs 5 recent scores and has ${evidence.recentCount} so far.`,
  };
  const description = state === 'stable' ? 'stable' : state === 'variable' ? 'variable' : 'volatile';
  const supporting = evidence.scoreRange === 0
    ? 'Across your last five rounds, every score relative to par was the same.'
    : `Across your last five rounds, your score relative to par was typically within about ${formatStrokeCount(evidence.standardDeviation)} of your recent average, and ${formatStrokeCount(evidence.scoreRange)} separated your best and worst rounds.`;
  return {
    conclusion: `Your recent scoring has been ${description} from round to round.`,
    supporting,
  };
}

export function assertFreeGameTrendsCopySafe(text: string): void {
  const normalized = text.toLowerCase();
  for (const forbidden of ['strokes gained', 'gaining strokes', 'losing strokes', 'sg average', 'sg delta']) {
    if (normalized.includes(forbidden)) throw new Error(`Free Game Trends copy contains restricted terminology: ${forbidden}`);
  }
  if (/\bsg\b/i.test(text)) throw new Error('Free Game Trends copy contains restricted terminology: SG');
}
