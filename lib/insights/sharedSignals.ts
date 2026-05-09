export type SharedPersistenceTier = 'none' | 'temporary' | 'emerging' | 'persistent';
export type SharedVolatilitySeverity = 'insufficient' | 'moderate' | 'strong';
export type SharedBalancedReason = 'none' | 'neutral_band' | 'opportunity_tie' | 'no_clear_separation';

type PersistenceTierOptions = {
  emergingMinCount?: number;
  persistentMinCount?: number;
};

type VolatilityOptions = {
  strongStdDev?: number;
  moderateStdDev?: number;
  strongScoreRange?: number | null;
  moderateScoreRange?: number | null;
};

type BalancedOptions = {
  opportunityThreshold?: number;
  strengthThreshold?: number;
  tieSeparationThreshold?: number;
  neutralBandAbs?: number;
};

const DEFAULT_PERSISTENCE_EMERGING_MIN_COUNT = 2;
const DEFAULT_PERSISTENCE_PERSISTENT_MIN_COUNT = 4;
const DEFAULT_MILD_WEAKNESS_THRESHOLD = 0.25;
const DEFAULT_RECOVERING_WEAKNESS_THRESHOLD = 0.35;
const DEFAULT_STRONG_VOLATILITY_STDDEV = 3;
const DEFAULT_MODERATE_VOLATILITY_STDDEV = 2;
const DEFAULT_OPPORTUNITY_THRESHOLD = -0.15;
const DEFAULT_STRENGTH_THRESHOLD = 0.15;
const DEFAULT_TIE_SEPARATION_THRESHOLD = 0.03;
const DEFAULT_NEUTRAL_BAND_ABS = 0.15;
const EPSILON = 0.000001;

export function resolvePersistenceTierFromFrequency(
  countRaw: number | null | undefined,
  windowRaw: number | null | undefined,
  options?: PersistenceTierOptions,
): SharedPersistenceTier {
  const count = Number.isFinite(countRaw) ? Math.max(0, Math.floor(countRaw as number)) : 0;
  const window = Number.isFinite(windowRaw) ? Math.max(0, Math.floor(windowRaw as number)) : 0;
  if (count <= 0 || window <= 0) return 'none';

  const emergingMinCount = options?.emergingMinCount ?? DEFAULT_PERSISTENCE_EMERGING_MIN_COUNT;
  const persistentMinCount = options?.persistentMinCount ?? DEFAULT_PERSISTENCE_PERSISTENT_MIN_COUNT;
  const persistentThreshold = Math.min(window, persistentMinCount);

  if (count >= persistentThreshold) return 'persistent';
  if (count >= emergingMinCount) return 'emerging';
  return 'temporary';
}

export function isRecurringPersistenceTier(tier: SharedPersistenceTier): boolean {
  return tier === 'emerging' || tier === 'persistent';
}

export function shouldDowngradeRecurringWeakness(args: {
  tier: SharedPersistenceTier;
  currentDelta: number | null | undefined;
  mildWeaknessThreshold?: number;
  recoveringWeaknessThreshold?: number;
}): boolean {
  if (!isRecurringPersistenceTier(args.tier)) return false;
  if (args.currentDelta == null || !Number.isFinite(args.currentDelta)) return true;

  const mildWeaknessThreshold = args.mildWeaknessThreshold ?? DEFAULT_MILD_WEAKNESS_THRESHOLD;
  const recoveringWeaknessThreshold =
    args.recoveringWeaknessThreshold ?? DEFAULT_RECOVERING_WEAKNESS_THRESHOLD;

  // Non-negative deltas indicate no active leak right now.
  if (args.currentDelta >= 0) return true;

  const weaknessAbs = Math.abs(args.currentDelta);
  if (weaknessAbs < mildWeaknessThreshold) return true;

  return args.tier === 'persistent' && weaknessAbs < recoveringWeaknessThreshold;
}

export function downgradePersistenceTierForWeakness(args: {
  tier: SharedPersistenceTier;
  currentDelta: number | null | undefined;
  mildWeaknessThreshold?: number;
  recoveringWeaknessThreshold?: number;
}): SharedPersistenceTier {
  if (
    !shouldDowngradeRecurringWeakness({
      tier: args.tier,
      currentDelta: args.currentDelta,
      mildWeaknessThreshold: args.mildWeaknessThreshold,
      recoveringWeaknessThreshold: args.recoveringWeaknessThreshold,
    })
  ) {
    return args.tier;
  }

  if (args.tier === 'persistent') return 'emerging';
  if (args.tier === 'emerging') return 'temporary';
  return args.tier;
}

export function classifyVolatilitySignal(args: {
  consistencyLabel: string | null | undefined;
  stdDev: number | null | undefined;
  scoreRange?: number | null;
  options?: VolatilityOptions;
}): {
  severity: SharedVolatilitySeverity;
  hasCeilingFloorGap: boolean;
} {
  const label = String(args.consistencyLabel ?? '').trim().toLowerCase();
  const stdDev = args.stdDev != null && Number.isFinite(args.stdDev) ? (args.stdDev as number) : null;
  const scoreRange =
    args.scoreRange != null && Number.isFinite(args.scoreRange) ? (args.scoreRange as number) : null;
  const strongStdDev = args.options?.strongStdDev ?? DEFAULT_STRONG_VOLATILITY_STDDEV;
  const moderateStdDev = args.options?.moderateStdDev ?? DEFAULT_MODERATE_VOLATILITY_STDDEV;
  const strongScoreRange = args.options?.strongScoreRange ?? null;
  const moderateScoreRange = args.options?.moderateScoreRange ?? null;

  const strongByLabel = label === 'volatile';
  const moderateByLabel = label === 'moderate';
  const strongByStdDev = stdDev != null && stdDev >= strongStdDev;
  const moderateByStdDev = stdDev != null && stdDev >= moderateStdDev;
  const strongByRange =
    scoreRange != null &&
    strongScoreRange != null &&
    Number.isFinite(strongScoreRange) &&
    scoreRange >= strongScoreRange;
  const moderateByRange =
    scoreRange != null &&
    moderateScoreRange != null &&
    Number.isFinite(moderateScoreRange) &&
    scoreRange >= moderateScoreRange;

  if (strongByLabel || strongByStdDev || strongByRange) {
    return {
      severity: 'strong',
      hasCeilingFloorGap: Boolean(strongByRange),
    };
  }

  if (moderateByLabel || moderateByStdDev || moderateByRange) {
    return {
      severity: 'moderate',
      hasCeilingFloorGap: false,
    };
  }

  return {
    severity: 'insufficient',
    hasCeilingFloorGap: false,
  };
}

export function classifyBalancedComponents(args: {
  deltas: Array<number | null | undefined>;
  options?: BalancedOptions;
}): {
  isBalanced: boolean;
  reason: SharedBalancedReason;
} {
  const values = args.deltas.filter((value): value is number => value != null && Number.isFinite(value));
  if (!values.length) {
    return { isBalanced: true, reason: 'no_clear_separation' };
  }

  const opportunityThreshold = args.options?.opportunityThreshold ?? DEFAULT_OPPORTUNITY_THRESHOLD;
  const strengthThreshold = args.options?.strengthThreshold ?? DEFAULT_STRENGTH_THRESHOLD;
  const tieSeparationThreshold =
    args.options?.tieSeparationThreshold ?? DEFAULT_TIE_SEPARATION_THRESHOLD;
  const neutralBandAbs = args.options?.neutralBandAbs ?? DEFAULT_NEUTRAL_BAND_ABS;

  const allNeutral = values.every((value) => Math.abs(value) <= neutralBandAbs + EPSILON);
  if (allNeutral) {
    return { isBalanced: true, reason: 'neutral_band' };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const worst = sorted[0];
  const secondWorst = sorted[1] ?? null;
  const strongest = sorted[sorted.length - 1];
  const hasOpportunity = worst <= opportunityThreshold + EPSILON;
  const hasStrength = strongest >= strengthThreshold - EPSILON;

  if (
    hasOpportunity &&
    secondWorst != null &&
    secondWorst - worst <= tieSeparationThreshold + EPSILON
  ) {
    return { isBalanced: true, reason: 'opportunity_tie' };
  }

  if (!hasOpportunity && !hasStrength) {
    return { isBalanced: true, reason: 'no_clear_separation' };
  }

  return { isBalanced: false, reason: 'none' };
}
