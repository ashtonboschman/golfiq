import type {
  RoundIdentity,
  RoundIdentityEvidenceArea,
  RoundIdentityPrimaryKey,
} from '@/lib/insights/roundIdentity/types';

export type RoundInsightSupportMode =
  | 'primary_evidence'
  | 'strength_reinforcement'
  | 'weakness_reinforcement'
  | 'contrast'
  | 'balanced'
  | 'limited_context';

export type RoundInsightRelationship =
  | 'same_category'
  | 'strength_supported'
  | 'weakness_supported'
  | 'strength_vs_weakness'
  | 'broad_round_story'
  | 'limited_evidence';

export type RoundInsightNarrativePlan = {
  primaryIdentity: RoundIdentityPrimaryKey;
  primaryCategory: RoundIdentityEvidenceArea | null;
  supportMode: RoundInsightSupportMode;
  supportCategory: RoundIdentityEvidenceArea | null;
  actionCategory: RoundIdentityEvidenceArea | null;
  relationship: RoundInsightRelationship;
};

const PRIMARY_CATEGORY: Partial<Record<RoundIdentityPrimaryKey, RoundIdentityEvidenceArea>> = {
  putting_saved: 'putting',
  putting_leak: 'putting',
  approach_carried: 'approach',
  approach_leak: 'approach',
  tee_controlled: 'off_tee',
  tee_trouble: 'off_tee',
  short_game_rescue: 'short_game',
  short_game_pressure: 'short_game',
  penalty_damaged: 'penalties',
  big_number: 'big_numbers',
  volatile_scoring: 'big_numbers',
  scoring_chance_missed: 'putting',
  steady_scoring: 'scoring',
};

function areaExists(identity: RoundIdentity, area: RoundIdentityEvidenceArea | null): boolean {
  if (!area) return false;
  return (
    identity.displayEvidence?.strongestArea?.area === area ||
    identity.displayEvidence?.weakestArea?.area === area
  );
}

function strongestArea(identity: RoundIdentity): RoundIdentityEvidenceArea | null {
  return identity.displayEvidence?.strongestArea?.area ?? null;
}

function weakestArea(identity: RoundIdentity): RoundIdentityEvidenceArea | null {
  return identity.displayEvidence?.weakestArea?.area ?? null;
}

export function buildRoundInsightNarrativePlan(identity: RoundIdentity): RoundInsightNarrativePlan {
  const primaryCategory = PRIMARY_CATEGORY[identity.primaryKey] ?? null;
  const positiveOverall = identity.overallTone === 'success' || identity.overallTone === 'great';

  if (
    (identity.primaryKey === 'big_number' || identity.primaryKey === 'volatile_scoring') &&
    positiveOverall &&
    strongestArea(identity)
  ) {
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: 'big_numbers',
      supportMode: 'contrast',
      supportCategory: strongestArea(identity),
      actionCategory: 'big_numbers',
      relationship: 'strength_vs_weakness',
    };
  }

  if (identity.primaryKey === 'penalty_damaged' && weakestArea(identity) === 'big_numbers') {
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: 'penalties',
      supportMode: 'weakness_reinforcement',
      supportCategory: 'big_numbers',
      actionCategory: 'big_numbers',
      relationship: 'same_category',
    };
  }

  if (identity.evidenceLevel === 'score_only') {
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: identity.primaryKey === 'breakthrough' ? 'scoring' : null,
      supportMode: 'limited_context',
      supportCategory: null,
      actionCategory: null,
      relationship: 'limited_evidence',
    };
  }

  if (primaryCategory && areaExists(identity, primaryCategory)) {
    const isPositivePrimary =
      identity.primaryKey === 'putting_saved' ||
      identity.primaryKey === 'approach_carried' ||
      identity.primaryKey === 'tee_controlled' ||
      identity.primaryKey === 'short_game_rescue';
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory,
      supportMode: isPositivePrimary ? 'strength_reinforcement' : 'weakness_reinforcement',
      supportCategory: primaryCategory,
      actionCategory: primaryCategory,
      relationship: 'same_category',
    };
  }

  if (primaryCategory) {
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory,
      supportMode: identity.tone === 'repeat' ? 'strength_reinforcement' : 'primary_evidence',
      supportCategory: primaryCategory,
      actionCategory: primaryCategory,
      relationship: 'same_category',
    };
  }

  if (identity.primaryKey === 'breakthrough' || identity.primaryKey === 'clean_control' || identity.primaryKey === 'all_around_strong') {
    const supportCategory = strongestArea(identity) ?? 'scoring';
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: 'scoring',
      supportMode: 'strength_reinforcement',
      supportCategory,
      actionCategory: supportCategory,
      relationship: 'strength_supported',
    };
  }

  if (identity.primaryKey === 'everything_leaked') {
    const supportCategory = weakestArea(identity) ?? 'scoring';
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: 'scoring',
      supportMode: 'weakness_reinforcement',
      supportCategory,
      actionCategory: supportCategory,
      relationship: 'weakness_supported',
    };
  }

  if (identity.primaryKey === 'survival') {
    const actionCategory = weakestArea(identity) ?? strongestArea(identity) ?? 'scoring';
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: 'scoring',
      supportMode: strongestArea(identity) && weakestArea(identity) ? 'contrast' : 'primary_evidence',
      supportCategory: strongestArea(identity) ?? actionCategory,
      actionCategory,
      relationship: strongestArea(identity) && weakestArea(identity) ? 'strength_vs_weakness' : 'broad_round_story',
    };
  }

  if (identity.primaryKey === 'no_clear_separator') {
    return {
      primaryIdentity: identity.primaryKey,
      primaryCategory: null,
      supportMode: 'balanced',
      supportCategory: null,
      actionCategory: null,
      relationship: 'broad_round_story',
    };
  }

  return {
    primaryIdentity: identity.primaryKey,
    primaryCategory: null,
    supportMode: 'primary_evidence',
    supportCategory: strongestArea(identity) ?? weakestArea(identity),
    actionCategory: weakestArea(identity) ?? strongestArea(identity),
    relationship: 'broad_round_story',
  };
}
