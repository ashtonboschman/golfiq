import {
  ROUND_IDENTITY_V1_VERSION,
  type RoundIdentity,
  type RoundIdentityPrimaryKey,
} from '@/lib/insights/roundIdentity/types';
import type { DashboardRoundFocusCategory, LatestRoundFocusPolarity } from './types';

export type LatestRoundFocusCategory = DashboardRoundFocusCategory;

export type LatestRoundFocusCandidate =
  | {
      kind: 'available';
      sourceRoundId: string;
      category: LatestRoundFocusCategory;
      polarity: LatestRoundFocusPolarity;
      confidence: 'moderate' | 'strong';
      recommendation: string;
      primaryKey: RoundIdentityPrimaryKey;
      evidenceLevel: RoundIdentity['evidenceLevel'];
      identityTone: RoundIdentity['tone'];
      overallTone: RoundIdentity['overallTone'] | null;
    }
  | {
      kind: 'unavailable';
      reason:
        | 'missing_identity'
        | 'stale_identity'
        | 'missing_m3'
        | 'insufficient_confidence'
        | 'unsupported_category'
        | 'malformed';
    };

export type ExtractLatestRoundFocusInput = {
  identity: RoundIdentity | null | undefined;
  sourceRoundId: string;
  /** The caller owns input-hash validation; this adapter never recomputes it. */
  isCurrent: boolean;
  /** Fresh canonical buildWatchCard output. Legacy stored messages are not accepted. */
  canonicalRecommendation: string | null | undefined;
};

type CanonicalFocusContract = {
  category: LatestRoundFocusCategory;
  polarity: LatestRoundFocusPolarity;
};

function isSupportedLatestRoundConfidence(
  value: unknown,
): value is 'moderate' | 'strong' {
  return value === 'moderate' || value === 'strong';
}

const PRIMARY_FOCUS_CONTRACT: Record<RoundIdentityPrimaryKey, CanonicalFocusContract> = {
  score_only_baseline: { category: 'scoring_control', polarity: 'neutral' },
  no_clear_separator: { category: 'scoring_control', polarity: 'neutral' },
  breakthrough: { category: 'scoring_control', polarity: 'strength' },
  clean_control: { category: 'scoring_control', polarity: 'strength' },
  all_around_strong: { category: 'all_around', polarity: 'strength' },
  approach_carried: { category: 'approach', polarity: 'strength' },
  tee_controlled: { category: 'off_the_tee', polarity: 'strength' },
  putting_saved: { category: 'putting', polarity: 'strength' },
  short_game_rescue: { category: 'short_game', polarity: 'strength' },
  steady_scoring: { category: 'scoring_control', polarity: 'neutral' },
  survival: { category: 'scoring_control', polarity: 'neutral' },
  approach_leak: { category: 'approach', polarity: 'weakness' },
  tee_trouble: { category: 'off_the_tee', polarity: 'weakness' },
  penalty_damaged: { category: 'penalties', polarity: 'weakness' },
  putting_leak: { category: 'putting', polarity: 'weakness' },
  short_game_pressure: { category: 'short_game', polarity: 'weakness' },
  scoring_chance_missed: { category: 'putting', polarity: 'weakness' },
  volatile_scoring: { category: 'volatility', polarity: 'weakness' },
  big_number: { category: 'big_numbers', polarity: 'weakness' },
  everything_leaked: { category: 'all_around', polarity: 'weakness' },
};

export function getRoundIdentityFocusContract(
  primaryKey: RoundIdentityPrimaryKey,
): CanonicalFocusContract | null {
  return PRIMARY_FOCUS_CONTRACT[primaryKey] ?? null;
}

export function mapRoundIdentityPrimaryKeyToFocusCategory(
  primaryKey: RoundIdentityPrimaryKey,
): LatestRoundFocusCategory | null {
  return getRoundIdentityFocusContract(primaryKey)?.category ?? null;
}

export function mapRoundIdentityPrimaryKeyToFocusPolarity(
  primaryKey: RoundIdentityPrimaryKey,
): LatestRoundFocusPolarity | null {
  return getRoundIdentityFocusContract(primaryKey)?.polarity ?? null;
}

export function extractLatestRoundFocus(
  input: ExtractLatestRoundFocusInput,
): LatestRoundFocusCandidate {
  if (!input.identity) return { kind: 'unavailable', reason: 'missing_identity' };
  if (input.identity.version !== ROUND_IDENTITY_V1_VERSION || !input.isCurrent) {
    return { kind: 'unavailable', reason: 'stale_identity' };
  }
  if (typeof input.identity.inputHash !== 'string' || input.identity.inputHash.trim().length === 0) {
    return { kind: 'unavailable', reason: 'malformed' };
  }
  if (typeof input.sourceRoundId !== 'string' || input.sourceRoundId.trim().length === 0) {
    return { kind: 'unavailable', reason: 'malformed' };
  }
  if (input.canonicalRecommendation == null) {
    return { kind: 'unavailable', reason: 'missing_m3' };
  }
  if (
    typeof input.canonicalRecommendation !== 'string' ||
    input.canonicalRecommendation.trim().length === 0
  ) {
    return { kind: 'unavailable', reason: 'malformed' };
  }
  if (!isSupportedLatestRoundConfidence(input.identity.confidence)) {
    return { kind: 'unavailable', reason: 'insufficient_confidence' };
  }

  const focusContract = getRoundIdentityFocusContract(input.identity.primaryKey);
  if (!focusContract) return { kind: 'unavailable', reason: 'unsupported_category' };

  return {
    kind: 'available',
    sourceRoundId: input.sourceRoundId,
    category: focusContract.category,
    polarity: focusContract.polarity,
    confidence: input.identity.confidence,
    recommendation: input.canonicalRecommendation,
    primaryKey: input.identity.primaryKey,
    evidenceLevel: input.identity.evidenceLevel,
    identityTone: input.identity.tone,
    overallTone: input.identity.overallTone ?? null,
  };
}
