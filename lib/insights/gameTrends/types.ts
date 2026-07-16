import { z } from 'zod';

export type GameTrendsMode = 'combined' | '9' | '18';
export type GameTrendsTier = 'free' | 'premium';
export type GameTrendsConfidence = 'building' | 'moderate' | 'strong';
export type GameTrendsComponent = 'off_the_tee' | 'approach' | 'short_game' | 'putting' | 'penalties';
export type EvidenceMaturity = 'none' | 'snapshot' | 'early_level' | 'current_form' | 'early_comparison' | 'established';
export type ProfileMaturity = 'provisional' | 'recent_supported' | 'established' | 'sustained';
export type ComponentChange = 'worsening' | 'stable' | 'improving' | 'softening' | 'baseline_unavailable';
export type RecentFormState =
  | 'unavailable'
  | 'first_round_snapshot'
  | 'early_scoring_level'
  | 'current_form'
  | 'early_better'
  | 'early_similar'
  | 'early_worse'
  | 'better_than_established'
  | 'near_established'
  | 'worse_than_established';
export type ScoringMomentumState = 'improving' | 'steady' | 'worsening' | 'unavailable';
export type ScoringLevel = 'better' | 'near' | 'higher' | 'building';
export type ScoringOutlookStatus =
  | 'improving'
  | 'holding'
  | 'softening'
  | 'steady'
  | 'trending_higher'
  | 'recovering'
  | 'worsening'
  | 'building';
export type StabilityState = 'unavailable' | 'building' | 'stable' | 'variable' | 'volatile';
export type GameProfileState = 'strength_and_opportunity' | 'strength_only' | 'opportunity_only' | 'balanced' | 'building' | 'unavailable';
export type GameProfileBuildingReason = 'insufficient_rounds' | 'insufficient_coverage' | 'insufficient_quality' | 'conflicting_evidence' | null;

export type ScoringMomentumEvidence = {
  state: ScoringMomentumState;
  recentCount: number;
  comparisonCount: number;
  recentAverageScore: number | null;
  comparisonAverageScore: number | null;
  deltaVsPrevious: number | null;
};

export type RecentFormEvidence = {
  recentCount: number;
  baselineCount: number;
  averageScore: number | null;
  averageToPar: number | null;
  baselineAverageScore: number | null;
  deltaVsBaseline: number | null;
  bestScore: number | null;
  scoreRange: number | null;
  latestScore: number | null;
  latestToPar: number | null;
  momentum: ScoringMomentumEvidence;
};

export type CanonicalComponentEvidence = {
  recentWindowCount: number;
  trackedRecentCount: number;
  rankedHighestCount: number;
  rankedLowestCount: number;
  evidenceSpanDays: number | null;
  recentSgAverage: number;
  baselineSgAverage: number | null;
  sgDelta: number | null;
  positiveRoundCount: number;
  negativeRoundCount: number;
  separation: number;
};

export type CanonicalProfileConclusion = {
  component: GameTrendsComponent;
  confidence: GameTrendsConfidence;
  change: ComponentChange;
  maturity: ProfileMaturity;
  evidence: CanonicalComponentEvidence;
};

export type GameTrendsV2Canonical = {
  version: 2;
  mode: GameTrendsMode;
  recentForm: {
    state: RecentFormState;
    confidence: GameTrendsConfidence;
    maturity: EvidenceMaturity;
    evidence: RecentFormEvidence;
  };
  gameProfile: {
    state: GameProfileState;
    confidence: GameTrendsConfidence;
    strength: CanonicalProfileConclusion | null;
    opportunity: CanonicalProfileConclusion | null;
    buildingReason: GameProfileBuildingReason;
  };
  stability: {
    state: StabilityState;
    confidence: GameTrendsConfidence;
    evidence: { recentCount: number; standardDeviation: number | null; scoreRange: number | null };
  };
  confidence: GameTrendsConfidence;
};

export type CachedGameTrendsV2 = {
  version: 2;
  configVersion: 'game-trends-v2.2';
  inputHash: string;
  byMode: Record<GameTrendsMode, GameTrendsV2Canonical>;
};

export type FreeComponentEvidenceDto = {
  kind: 'free_safe';
  recentWindowCount: number;
  trackedRecentCount: number;
  rankedHighestCount: number;
  rankedLowestCount: number;
  change: ComponentChange;
  evidenceSpanDays: number | null;
};

export type PremiumComponentEvidenceDto = {
  kind: 'premium';
  recentWindowCount: number;
  trackedRecentCount: number;
  rankedHighestCount: number;
  rankedLowestCount: number;
  change: ComponentChange;
  evidenceSpanDays: number | null;
  recentSgAverage: number;
  baselineSgAverage: number | null;
  sgDelta: number | null;
  positiveRoundCount: number;
  negativeRoundCount: number;
  separation: number;
};

export type GameProfileConclusionDto = Omit<CanonicalProfileConclusion, 'evidence'> & {
  copyKey: string;
  analyticsKey: 'strength' | 'opportunity';
  evidence: FreeComponentEvidenceDto | PremiumComponentEvidenceDto;
};

export type GameTrendsV2Dto = {
  version: 2;
  tier: GameTrendsTier;
  mode: GameTrendsMode;
  recentForm: GameTrendsV2Canonical['recentForm'] & { copyKey: string; analyticsKey: 'recent_form' };
  gameProfile: Omit<GameTrendsV2Canonical['gameProfile'], 'strength' | 'opportunity'> & {
    copyKey: string;
    analyticsKey: 'game_profile';
    strength: GameProfileConclusionDto | null;
    opportunity: GameProfileConclusionDto | null;
  };
  stability: GameTrendsV2Canonical['stability'] & { copyKey: string; analyticsKey: 'stability' };
  confidence: GameTrendsConfidence;
};

const confidenceSchema = z.enum(['building', 'moderate', 'strong']);
const componentSchema = z.enum(['off_the_tee', 'approach', 'short_game', 'putting', 'penalties']);
const changeSchema = z.enum(['worsening', 'stable', 'improving', 'softening', 'baseline_unavailable']);
const maturitySchema = z.enum(['provisional', 'recent_supported', 'established', 'sustained']);
const nullableFinite = z.number().finite().nullable();

const recentEvidenceSchema = z.object({
  recentCount: z.number().int().nonnegative(),
  baselineCount: z.number().int().nonnegative(),
  averageScore: nullableFinite,
  averageToPar: nullableFinite,
  baselineAverageScore: nullableFinite,
  deltaVsBaseline: nullableFinite,
  bestScore: nullableFinite,
  scoreRange: nullableFinite,
  latestScore: nullableFinite,
  latestToPar: nullableFinite,
  momentum: z.object({
    state: z.enum(['improving', 'steady', 'worsening', 'unavailable']),
    recentCount: z.number().int().nonnegative(),
    comparisonCount: z.number().int().nonnegative(),
    recentAverageScore: nullableFinite,
    comparisonAverageScore: nullableFinite,
    deltaVsPrevious: nullableFinite,
  }),
});

const canonicalEvidenceSchema = z.object({
  recentWindowCount: z.number().int().nonnegative(),
  trackedRecentCount: z.number().int().nonnegative(),
  rankedHighestCount: z.number().int().nonnegative(),
  rankedLowestCount: z.number().int().nonnegative(),
  evidenceSpanDays: nullableFinite,
  recentSgAverage: z.number().finite(),
  baselineSgAverage: nullableFinite,
  sgDelta: nullableFinite,
  positiveRoundCount: z.number().int().nonnegative(),
  negativeRoundCount: z.number().int().nonnegative(),
  separation: z.number().finite().nonnegative(),
});

const conclusionSchema = z.object({
  component: componentSchema,
  confidence: confidenceSchema,
  change: changeSchema,
  maturity: maturitySchema,
  evidence: canonicalEvidenceSchema,
});

export const gameTrendsCanonicalSchema = z.object({
  version: z.literal(2),
  mode: z.enum(['combined', '9', '18']),
  recentForm: z.object({
    state: z.enum(['unavailable', 'first_round_snapshot', 'early_scoring_level', 'current_form', 'early_better', 'early_similar', 'early_worse', 'better_than_established', 'near_established', 'worse_than_established']),
    confidence: confidenceSchema,
    maturity: z.enum(['none', 'snapshot', 'early_level', 'current_form', 'early_comparison', 'established']),
    evidence: recentEvidenceSchema,
  }),
  gameProfile: z.object({
    state: z.enum(['strength_and_opportunity', 'strength_only', 'opportunity_only', 'balanced', 'building', 'unavailable']),
    confidence: confidenceSchema,
    strength: conclusionSchema.nullable(),
    opportunity: conclusionSchema.nullable(),
    buildingReason: z.enum(['insufficient_rounds', 'insufficient_coverage', 'insufficient_quality', 'conflicting_evidence']).nullable(),
  }),
  stability: z.object({
    state: z.enum(['unavailable', 'building', 'stable', 'variable', 'volatile']),
    confidence: confidenceSchema,
    evidence: z.object({ recentCount: z.number().int().nonnegative(), standardDeviation: nullableFinite, scoreRange: nullableFinite }),
  }),
  confidence: confidenceSchema,
});

export const cachedGameTrendsSchema = z.object({
  version: z.literal(2),
  configVersion: z.literal('game-trends-v2.2'),
  inputHash: z.string().min(1),
  byMode: z.object({
    combined: gameTrendsCanonicalSchema,
    '9': gameTrendsCanonicalSchema,
    '18': gameTrendsCanonicalSchema,
  }),
}).superRefine((value, context) => {
  for (const mode of ['combined', '9', '18'] as const) {
    if (value.byMode[mode].mode !== mode) {
      context.addIssue({
        code: 'custom',
        path: ['byMode', mode, 'mode'],
        message: `Cached ${mode} entry has the wrong mode`,
      });
    }
  }
});

const freeEvidenceSchema = z.object({
  kind: z.literal('free_safe'),
  recentWindowCount: z.number().int().nonnegative(),
  trackedRecentCount: z.number().int().nonnegative(),
  rankedHighestCount: z.number().int().nonnegative(),
  rankedLowestCount: z.number().int().nonnegative(),
  change: changeSchema,
  evidenceSpanDays: nullableFinite,
}).strict();

const premiumEvidenceSchema = z.object({
  kind: z.literal('premium'),
  recentWindowCount: z.number().int().nonnegative(),
  trackedRecentCount: z.number().int().nonnegative(),
  rankedHighestCount: z.number().int().nonnegative(),
  rankedLowestCount: z.number().int().nonnegative(),
  change: changeSchema,
  evidenceSpanDays: nullableFinite,
  recentSgAverage: z.number().finite(),
  baselineSgAverage: nullableFinite,
  sgDelta: nullableFinite,
  positiveRoundCount: z.number().int().nonnegative(),
  negativeRoundCount: z.number().int().nonnegative(),
  separation: z.number().finite().nonnegative(),
}).strict();

const dtoConclusionSchema = conclusionSchema.omit({ evidence: true }).extend({
  copyKey: z.string().min(1),
  analyticsKey: z.enum(['strength', 'opportunity']),
  evidence: z.union([freeEvidenceSchema, premiumEvidenceSchema]),
});

export const gameTrendsDtoSchema = z.object({
  version: z.literal(2),
  tier: z.enum(['free', 'premium']),
  mode: z.enum(['combined', '9', '18']),
  recentForm: gameTrendsCanonicalSchema.shape.recentForm.extend({ copyKey: z.string().min(1), analyticsKey: z.literal('recent_form') }),
  gameProfile: gameTrendsCanonicalSchema.shape.gameProfile.omit({ strength: true, opportunity: true }).extend({
    copyKey: z.string().min(1),
    analyticsKey: z.literal('game_profile'),
    strength: dtoConclusionSchema.nullable(),
    opportunity: dtoConclusionSchema.nullable(),
  }),
  stability: gameTrendsCanonicalSchema.shape.stability.extend({ copyKey: z.string().min(1), analyticsKey: z.literal('stability') }),
  confidence: confidenceSchema,
}).superRefine((value, context) => {
  for (const conclusion of [value.gameProfile.strength, value.gameProfile.opportunity]) {
    if (!conclusion) continue;
    if (value.tier === 'free' && conclusion.evidence.kind !== 'free_safe') {
      context.addIssue({ code: 'custom', message: 'Free Game Trends cannot contain Premium evidence' });
    }
    if (value.tier === 'premium' && conclusion.evidence.kind !== 'premium') {
      context.addIssue({ code: 'custom', message: 'Premium Game Trends must contain Premium evidence' });
    }
  }
});

export function parseCachedGameTrends(value: unknown): CachedGameTrendsV2 | null {
  const parsed = cachedGameTrendsSchema.safeParse(value);
  return parsed.success ? parsed.data as CachedGameTrendsV2 : null;
}

export function parseGameTrendsDto(value: unknown): GameTrendsV2Dto | null {
  const parsed = gameTrendsDtoSchema.safeParse(value);
  return parsed.success ? parsed.data as GameTrendsV2Dto : null;
}
