export type DashboardTrendMode = 'combined' | '9' | '18';

export type DashboardTrendCategory =
  | 'off_the_tee'
  | 'approach'
  | 'short_game'
  | 'putting';

export type DashboardRoundFocusCategory =
  | DashboardTrendCategory
  | 'penalties'
  | 'scoring_control'
  | 'big_numbers'
  | 'volatility'
  | 'all_around';

export type LatestRoundFocusPolarity = 'strength' | 'weakness' | 'neutral';

export type TrendComponentValue = {
  /** Native-hole SG value. Combined mode normalizes nine-hole values once. */
  value: number | null;
  /** Whether the underlying stat required for this component was tracked. */
  tracked: boolean;
};

export type TrendRoundInput = {
  roundId: string;
  playedAt?: string | Date | null;
  holes: 9 | 18;
  components: Record<DashboardTrendCategory, TrendComponentValue>;
  /** Retained only for diagnostics; residual is never considered by the resolver. */
  residual?: TrendComponentValue;
  /** Short Game only counts when this round had enough opportunities. */
  shortGameOpportunityEligible: boolean;
  /** Diagnostic metadata; this does not determine trend confidence. */
  sgPartialAnalysis?: boolean | null;
};

export type DashboardTrendResolverInput = {
  recentRounds: TrendRoundInput[];
  baselineRounds: TrendRoundInput[];
  mode: DashboardTrendMode;
};

export type DashboardTrendCandidate = {
  category: DashboardTrendCategory;
  recentAverage: number;
};

export type DashboardTrendResult =
  | {
      kind: 'component';
      category: DashboardTrendCategory;
      confidence: 'moderate' | 'strong';
      recentAverage: number;
      baselineAverage: number | null;
      baselineDelta: number | null;
      trackedRecentCount: number;
      negativeRecentCount: number;
      lowestComponentCount: number;
      separation: number;
      baselineDirection: 'worse' | 'stable' | 'improving' | 'unavailable';
      reason:
        | 'negative_declining'
        | 'negative_stable'
        | 'negative_improving'
        | 'negative_baseline_unavailable';
    }
  | {
      kind: 'no_clear_separator';
      confidence: 'building';
      candidates: DashboardTrendCandidate[];
    }
  | {
      kind: 'all_positive';
      confidence: 'building';
    }
  | {
      kind: 'insufficient_evidence';
      confidence: 'building';
      reason:
        | 'fewer_than_five_recent'
        | 'insufficient_component_coverage'
        | 'no_repeated_negative_component'
        | 'insufficient_separation'
        | 'no_eligible_components';
    };

export type DashboardRoundFocusEvidenceDto = {
  recentAverage: number;
  baselineAverage: number | null;
  baselineDelta: number | null;
  trackedRecentCount: number;
  negativeRecentCount: number;
  lowestComponentCount: number;
  separation: number;
};

export type DashboardRoundFocusDto = {
  version: 'dashboard_round_focus_v2';
  tier: 'free' | 'premium';
  source: 'trend' | 'latest_round' | 'neutral';
  relationship:
    | 'trend_only'
    | 'reinforced_by_latest_round'
    | 'latest_round_improved_against_trend'
    | 'latest_round_inconclusive_same_category'
    | 'latest_round_conflicts'
    | 'latest_round_fallback'
    | 'no_supported_focus';
  selectedCategory: DashboardRoundFocusCategory | null;
  confidence: 'building' | 'moderate' | 'strong';
  trendState: DashboardTrendResult['kind'];
  baselineDirection: 'worse' | 'stable' | 'improving' | 'unavailable' | null;
  latestRoundCategory: DashboardRoundFocusCategory | null;
  latestRoundPolarity: LatestRoundFocusPolarity | null;
  sourceRoundId: string | null;
  trendReason: string | null;
  latestRoundUnavailableReason: string | null;
  evidence?: DashboardRoundFocusEvidenceDto;
};

const SOURCES = ['trend', 'latest_round', 'neutral'] as const;
const RELATIONSHIPS = [
  'trend_only',
  'reinforced_by_latest_round',
  'latest_round_improved_against_trend',
  'latest_round_inconclusive_same_category',
  'latest_round_conflicts',
  'latest_round_fallback',
  'no_supported_focus',
] as const;
const CATEGORIES = [
  'off_the_tee',
  'approach',
  'short_game',
  'putting',
  'penalties',
  'scoring_control',
  'big_numbers',
  'volatility',
  'all_around',
] as const;
const TREND_CATEGORIES = ['off_the_tee', 'approach', 'short_game', 'putting'] as const;
const POLARITIES = ['strength', 'weakness', 'neutral'] as const;
const CONFIDENCES = ['building', 'moderate', 'strong'] as const;
const TREND_STATES = ['component', 'no_clear_separator', 'all_positive', 'insufficient_evidence'] as const;
const BASELINE_DIRECTIONS = ['worse', 'stable', 'improving', 'unavailable'] as const;
const FOCUS_REASONS = [
  'negative_declining',
  'negative_stable',
  'negative_improving',
  'negative_baseline_unavailable',
  'no_clear_separator',
  'all_positive',
  'fewer_than_five_recent',
  'insufficient_component_coverage',
  'no_repeated_negative_component',
  'insufficient_separation',
  'no_eligible_components',
  'missing_identity',
  'stale_identity',
  'missing_m3',
  'insufficient_confidence',
  'unsupported_category',
  'malformed',
  'pipeline_error',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnumValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isNullableEnum<T extends readonly string[]>(value: unknown, values: T): boolean {
  return value === null || isEnumValue(value, values);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEvidence(value: unknown): value is DashboardRoundFocusEvidenceDto {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.recentAverage) &&
    (value.baselineAverage === null || isFiniteNumber(value.baselineAverage)) &&
    (value.baselineDelta === null || isFiniteNumber(value.baselineDelta)) &&
    isFiniteNumber(value.trackedRecentCount) &&
    isFiniteNumber(value.negativeRecentCount) &&
    isFiniteNumber(value.lowestComponentCount) &&
    isFiniteNumber(value.separation)
  );
}

export function parseDashboardRoundFocusDto(value: unknown): DashboardRoundFocusDto | null {
  if (!isRecord(value)) return null;
  if (value.version !== 'dashboard_round_focus_v2') return null;
  if (!isEnumValue(value.tier, ['free', 'premium'] as const)) return null;
  if (!isEnumValue(value.source, SOURCES)) return null;
  if (!isEnumValue(value.relationship, RELATIONSHIPS)) return null;
  if (!isNullableEnum(value.selectedCategory, CATEGORIES)) return null;
  if (!isEnumValue(value.confidence, CONFIDENCES)) return null;
  if (!isEnumValue(value.trendState, TREND_STATES)) return null;
  if (!isNullableEnum(value.baselineDirection, BASELINE_DIRECTIONS)) return null;
  if (!isNullableEnum(value.latestRoundCategory, CATEGORIES)) return null;
  if (!isNullableEnum(value.latestRoundPolarity, POLARITIES)) return null;
  if (!isNullableString(value.sourceRoundId)) return null;
  if (!isNullableString(value.trendReason) || !isNullableString(value.latestRoundUnavailableReason)) {
    return null;
  }
  if (value.trendReason !== null && !isEnumValue(value.trendReason, FOCUS_REASONS)) return null;
  if (
    value.latestRoundUnavailableReason !== null &&
    !isEnumValue(value.latestRoundUnavailableReason, FOCUS_REASONS)
  ) {
    return null;
  }
  if (value.evidence !== undefined && !isEvidence(value.evidence)) return null;

  const selectedCategory = value.selectedCategory as DashboardRoundFocusCategory | null;
  const latestRoundCategory = value.latestRoundCategory as DashboardRoundFocusCategory | null;
  const latestRoundPolarity = value.latestRoundPolarity as LatestRoundFocusPolarity | null;

  if (value.source === 'trend') {
    if (value.trendState !== 'component' || !isEnumValue(selectedCategory, TREND_CATEGORIES)) return null;
    if (value.baselineDirection === null || value.confidence === 'building') return null;
    if (!RELATIONSHIPS.slice(0, 5).includes(value.relationship as any)) return null;
    if (value.relationship === 'trend_only') {
      if (latestRoundCategory !== null || latestRoundPolarity !== null) return null;
    } else {
      if (latestRoundCategory === null || latestRoundPolarity === null) return null;
      const sameCategory = latestRoundCategory === selectedCategory;
      if (value.relationship === 'reinforced_by_latest_round' && (!sameCategory || latestRoundPolarity !== 'weakness')) return null;
      if (value.relationship === 'latest_round_improved_against_trend' && (!sameCategory || latestRoundPolarity !== 'strength')) return null;
      if (value.relationship === 'latest_round_inconclusive_same_category' && (!sameCategory || latestRoundPolarity !== 'neutral')) return null;
      if (value.relationship === 'latest_round_conflicts' && sameCategory) return null;
    }
  } else if (value.source === 'latest_round') {
    if (value.relationship !== 'latest_round_fallback') return null;
    if (value.trendState === 'component' || value.baselineDirection !== null) return null;
    if (selectedCategory === null || latestRoundCategory !== selectedCategory || latestRoundPolarity === null) return null;
    if (value.confidence === 'building') return null;
  } else {
    if (value.relationship !== 'no_supported_focus') return null;
    if (value.trendState === 'component' || value.baselineDirection !== null) return null;
    if (selectedCategory !== null || latestRoundCategory !== null || latestRoundPolarity !== null) return null;
    if (value.confidence !== 'building') return null;
  }

  return value as unknown as DashboardRoundFocusDto;
}
