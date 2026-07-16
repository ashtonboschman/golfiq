import {
  hasAnyAggregateStats,
  hasReliableApproachEvidence,
  hasReliablePenaltyEvidence,
  hasReliablePuttingEvidence,
  hasReliableShortGameEvidence,
  hasReliableTeeEvidence,
  getStatCompletenessScore,
} from '@/lib/insights/roundIdentity/features';
import type {
  RoundIdentityConfidence,
  RoundIdentityEntryMode,
  RoundIdentityEvidenceLevel,
  RoundIdentityEvidenceSnapshot,
  RoundIdentityResolverInput,
  RoundIdentitySampleContext,
} from '@/lib/insights/roundIdentity/types';

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveRoundEntryMode(holeByHole: boolean | null | undefined): RoundIdentityEntryMode {
  if (holeByHole === true) return 'live_round';
  if (holeByHole === false) return 'post_round';
  return 'unknown';
}

export function resolveSampleContext(roundsLifetime: number): RoundIdentitySampleContext {
  if (roundsLifetime <= 1) return 'first_round';
  if (roundsLifetime === 2) return 'early';
  return 'established';
}

export function resolveEvidenceLevel(input: RoundIdentityResolverInput): RoundIdentityEvidenceLevel {
  if (input.hasTrustedHoleByHole) return 'hole_by_hole';
  if (hasAnyAggregateStats(input)) return 'aggregate_stats';
  return 'score_only';
}

export function resolveRoundIdentityConfidence(input: {
  evidenceLevel: RoundIdentityEvidenceLevel;
  sampleContext: RoundIdentitySampleContext;
  statCompletenessScore: number;
}): RoundIdentityConfidence {
  if (input.sampleContext === 'first_round') return 'building';
  if (input.evidenceLevel === 'score_only') return 'building';
  if (input.evidenceLevel === 'hole_by_hole' && input.statCompletenessScore >= 70 && input.sampleContext === 'established') {
    return 'strong';
  }
  if (input.evidenceLevel === 'aggregate_stats' && input.statCompletenessScore < 45) {
    return 'building';
  }
  return input.sampleContext === 'established' ? 'moderate' : 'building';
}

export function buildEvidenceSnapshot(input: RoundIdentityResolverInput): RoundIdentityEvidenceSnapshot {
  const evidenceLevel = resolveEvidenceLevel(input);
  const sampleContext = resolveSampleContext(input.roundsLifetime);
  const statCompletenessScore = getStatCompletenessScore(input);
  const confidence = resolveRoundIdentityConfidence({
    evidenceLevel,
    sampleContext,
    statCompletenessScore,
  });
  const hasAggregateStats = hasAnyAggregateStats(input);
  const hasOptionalStats =
    toFiniteNumber(input.firHit) != null ||
    toFiniteNumber(input.girHit) != null ||
    toFiniteNumber(input.putts) != null ||
    toFiniteNumber(input.penalties) != null ||
    toFiniteNumber(input.chips) != null ||
    toFiniteNumber(input.greensideBunkerShots) != null;

  return {
    evidenceLevel,
    sampleContext,
    confidence,
    entryMode: input.entryMode,
    hasOptionalStats,
    hasAggregateStats,
    hasTrustedHoleByHole: input.hasTrustedHoleByHole,
    statCompletenessScore,
    hasReliableTeeEvidence: hasReliableTeeEvidence(input),
    hasReliableApproachEvidence: hasReliableApproachEvidence(input),
    hasReliablePuttingEvidence: hasReliablePuttingEvidence(input),
    hasReliableShortGameEvidence: hasReliableShortGameEvidence(input),
    hasReliablePenaltyEvidence: hasReliablePenaltyEvidence(input),
  };
}
