import {
  buildEvidenceSnapshot,
  resolveEvidenceLevel,
  resolveRoundEntryMode,
  resolveRoundIdentityConfidence,
  resolveSampleContext,
} from '@/lib/insights/roundIdentity/evidence';
import type { RoundIdentityResolverInput } from '@/lib/insights/roundIdentity/types';

function baseInput(overrides: Partial<RoundIdentityResolverInput> = {}): RoundIdentityResolverInput {
  return {
    roundId: '1',
    score: 88,
    parTotal: 72,
    toPar: 16,
    holesPlayed: 18,
    teeSegment: 'full',
    roundContext: 'real',
    roundsLifetime: 1,
    avgScoreRecent: null,
    handicapAtRound: null,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
    chips: null,
    greensideBunkerShots: null,
    shortGameShots: null,
    sgTotal: null,
    sgOffTee: null,
    sgApproach: null,
    sgShortGame: null,
    sgPutting: null,
    sgPenalties: null,
    sgResidual: null,
    sgConfidence: null,
    sgPartialAnalysis: null,
    entryMode: 'post_round',
    roundHoles: [],
    hasTrustedHoleByHole: false,
    ...overrides,
  };
}

describe('roundIdentity evidence', () => {
  it('maps entry mode from round.holeByHole signal', () => {
    expect(resolveRoundEntryMode(true)).toBe('live_round');
    expect(resolveRoundEntryMode(false)).toBe('post_round');
    expect(resolveRoundEntryMode(undefined)).toBe('unknown');
  });

  it('resolves sample context bands', () => {
    expect(resolveSampleContext(1)).toBe('first_round');
    expect(resolveSampleContext(3)).toBe('early');
    expect(resolveSampleContext(8)).toBe('established');
  });

  it('resolves score_only/aggregate/hbh evidence levels', () => {
    expect(resolveEvidenceLevel(baseInput())).toBe('score_only');
    expect(resolveEvidenceLevel(baseInput({ girHit: 7 }))).toBe('aggregate_stats');
    expect(resolveEvidenceLevel(baseInput({ hasTrustedHoleByHole: true }))).toBe('hole_by_hole');
  });

  it('confidence stays building for sparse first rounds and can become stronger with rich evidence', () => {
    expect(
      resolveRoundIdentityConfidence({
        evidenceLevel: 'score_only',
        sampleContext: 'first_round',
        statCompletenessScore: 0,
        sgConfidence: null,
      }),
    ).toBe('building');

    expect(
      resolveRoundIdentityConfidence({
        evidenceLevel: 'hole_by_hole',
        sampleContext: 'first_round',
        statCompletenessScore: 72,
        sgConfidence: 'high',
      }),
    ).toBe('moderate');

    expect(
      resolveRoundIdentityConfidence({
        evidenceLevel: 'hole_by_hole',
        sampleContext: 'established',
        statCompletenessScore: 75,
        sgConfidence: 'high',
      }),
    ).toBe('strong');
  });

  it('builds an evidence snapshot with reliability gates', () => {
    const snapshot = buildEvidenceSnapshot(
      baseInput({
        roundsLifetime: 7,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        firHit: 7,
        girHit: 8,
        putts: 33,
        penalties: 1,
        chips: 9,
        greensideBunkerShots: 1,
        shortGameShots: 10,
        sgApproach: 0.7,
        sgOffTee: 0.2,
        sgConfidence: 'high',
      }),
    );

    expect(snapshot.evidenceLevel).toBe('hole_by_hole');
    expect(snapshot.confidence).toBe('strong');
    expect(snapshot.hasReliableApproachEvidence).toBe(true);
    expect(snapshot.hasReliablePuttingEvidence).toBe(true);
    expect(snapshot.hasReliableShortGameEvidence).toBe(true);
    expect(snapshot.hasReliableTeeEvidence).toBe(true);
  });
});
