import type {
  RoundIdentity,
  RoundIdentityDisplayLevels,
  RoundIdentityPrimaryKey,
} from '@/lib/insights/roundIdentity/types';

const POSITIVE_PRIMARIES = new Set<RoundIdentityPrimaryKey>([
  'score_only_baseline',
  'breakthrough',
  'clean_control',
  'all_around_strong',
  'approach_carried',
  'putting_saved',
  'tee_controlled',
  'short_game_rescue',
  'steady_scoring',
]);

const LEAK_PRIMARIES = new Set<RoundIdentityPrimaryKey>([
  'penalty_damaged',
  'big_number',
  'everything_leaked',
  'approach_leak',
  'tee_trouble',
  'putting_leak',
  'short_game_pressure',
  'scoring_chance_missed',
]);

const URGENT_DAMAGE_PRIMARIES = new Set<RoundIdentityPrimaryKey>([
  'penalty_damaged',
  'big_number',
  'everything_leaked',
]);

export function resolveRoundIdentityDisplayLevels(identity: RoundIdentity): RoundIdentityDisplayLevels {
  const strongestArea = identity.displayEvidence?.strongestArea;
  const weakestArea = identity.displayEvidence?.weakestArea;
  const hasDamageModifier =
    identity.modifiers.includes('one_hole_damage') || identity.modifiers.includes('blow_up_stretch');
  const weakestAreaIsUrgent = weakestArea?.area === 'penalties' || weakestArea?.area === 'big_numbers';
  const hasNoReliableAggregateArea =
    identity.evidenceLevel === 'aggregate_stats' && !strongestArea && !weakestArea;

  const story =
    identity.overallTone ??
    (identity.primaryKey === 'breakthrough'
      ? 'great'
      : POSITIVE_PRIMARIES.has(identity.primaryKey)
        ? 'success'
        : LEAK_PRIMARIES.has(identity.primaryKey) || identity.primaryKey === 'volatile_scoring'
          ? 'warning'
          : 'info');

  if (identity.evidenceLevel === 'score_only' || hasNoReliableAggregateArea) {
    return { story, worked: 'info', watch: 'info' };
  }

  let worked: RoundIdentityDisplayLevels['worked'] = 'info';
  if (
    identity.primaryKey === 'no_clear_separator' &&
    identity.displayEvidence?.reliableAreaCount === 1 &&
    strongestArea
  ) {
    worked = 'success';
  } else if (
    identity.primaryKey === 'no_clear_separator' &&
    identity.displayEvidence?.reliableAreaCount === 1 &&
    weakestArea
  ) {
    worked = 'warning';
  } else if (identity.primaryKey === 'no_clear_separator') {
    worked = 'info';
  } else if ((identity.overallTone === 'success' || identity.overallTone === 'great') && strongestArea) {
    worked = 'success';
  } else if (
    identity.primaryKey !== 'score_only_baseline' &&
    (LEAK_PRIMARIES.has(identity.primaryKey) || identity.tone === 'fix' || (weakestArea && !strongestArea))
  ) {
    worked = 'warning';
  } else if (strongestArea) {
    worked = 'success';
  }

  let watch: RoundIdentityDisplayLevels['watch'] = 'info';
  if (
    identity.primaryKey === 'no_clear_separator' &&
    identity.displayEvidence?.reliableAreaCount === 1 &&
    strongestArea
  ) {
    watch = 'success';
  } else if (
    identity.primaryKey === 'no_clear_separator' &&
    identity.displayEvidence?.reliableAreaCount === 1 &&
    weakestArea
  ) {
    watch = 'warning';
  } else if (identity.tone === 'repeat') {
    if (hasDamageModifier || weakestAreaIsUrgent || URGENT_DAMAGE_PRIMARIES.has(identity.primaryKey)) {
      watch = 'warning';
    } else if (POSITIVE_PRIMARIES.has(identity.primaryKey)) {
      watch = 'success';
    }
  } else if (
    identity.tone === 'fix' &&
    (weakestAreaIsUrgent || URGENT_DAMAGE_PRIMARIES.has(identity.primaryKey))
  ) {
    watch = 'warning';
  }

  return { story, worked, watch };
}
