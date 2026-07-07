import {
  applyPlayedHoleOrder,
  getBigNumberCount,
  getFrontBackSplit,
  getOneHoleDamageShare,
  getParTypePerformance,
  getScoringBuckets,
  getVolatilityScore,
  getWorstHoleDamage,
  hasCompleteHoleScores,
  hasReliableApproachEvidence,
  hasReliablePuttingEvidence,
  hasReliableShortGameEvidence,
  hasReliableTeeEvidence,
  normalizeTrustedHoleSequence,
} from '@/lib/insights/roundIdentity/features';
import type { RoundIdentityResolverInput } from '@/lib/insights/roundIdentity/types';

function buildBaseInput(overrides: Partial<RoundIdentityResolverInput> = {}): RoundIdentityResolverInput {
  return {
    roundId: '1',
    score: 84,
    parTotal: 72,
    toPar: 12,
    holesPlayed: 18,
    teeSegment: 'full',
    roundContext: 'real',
    roundsLifetime: 6,
    avgScoreRecent: 86,
    handicapAtRound: 15.2,
    firHit: 6,
    girHit: 7,
    putts: 34,
    penalties: 2,
    chips: 9,
    greensideBunkerShots: 1,
    shortGameShots: 10,
    sgTotal: 1.2,
    sgOffTee: 0.3,
    sgApproach: 0.4,
    sgShortGame: 0.1,
    sgPutting: 0.5,
    sgPenalties: -0.1,
    sgResidual: 0,
    sgConfidence: 'medium',
    sgPartialAnalysis: false,
    entryMode: 'live_round',
    hasTrustedHoleByHole: true,
    roundHoles: Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: index % 4 === 0 ? 5 : index % 3 === 0 ? 3 : 4,
      score: index % 6 === 0 ? 6 : 5,
      pass: 1,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 1,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    })),
    ...overrides,
  };
}

describe('roundIdentity features', () => {
  it('recognizes complete hole scores only when every expected hole has score and par', () => {
    const input = buildBaseInput();
    expect(hasCompleteHoleScores({ holesPlayed: input.holesPlayed, roundHoles: input.roundHoles })).toBe(true);

    const partial = [...input.roundHoles];
    partial.pop();
    expect(hasCompleteHoleScores({ holesPlayed: input.holesPlayed, roundHoles: partial })).toBe(false);
  });

  it('normalizes a back-nine sequence by played order', () => {
    const roundHoles = Array.from({ length: 9 }, (_, index) => ({
      holeNumber: index + 10,
      par: index % 3 === 0 ? 3 : 4,
      score: index % 4 === 0 ? 5 : 4,
      pass: 1,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const normalized = normalizeTrustedHoleSequence({ holesPlayed: 9, roundHoles });
    expect(normalized).toHaveLength(9);
    expect(normalized.map((hole) => hole.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(hasCompleteHoleScores({ holesPlayed: 9, roundHoles })).toBe(true);
  });

  it('normalizes double-nine passes as an 18-hole played sequence', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: (index % 9) + 1,
      par: index % 3 === 0 ? 3 : 4,
      score: index % 5 === 0 ? 5 : 4,
      pass: index < 9 ? 1 : 2,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const normalized = normalizeTrustedHoleSequence({ holesPlayed: 18, roundHoles });
    expect(normalized).toHaveLength(18);
    expect(normalized.map((hole) => hole.holeNumber)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(hasCompleteHoleScores({ holesPlayed: 18, roundHoles })).toBe(true);
  });

  it('preserves the actual sequence when a live round starts on hole 7', () => {
    const canonical = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: 4,
      score: index + 1,
      pass: 1,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const played = applyPlayedHoleOrder(canonical, 7);
    const normalized = normalizeTrustedHoleSequence({ holesPlayed: 18, roundHoles: played });

    expect(played.map((hole) => hole.holeNumber)).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6,
    ]);
    expect(normalized.map((hole) => hole.score)).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('uses display-hole order when the second pass of a double nine starts first', () => {
    const canonical = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: (index % 9) + 1,
      par: 4,
      score: index + 1,
      pass: index < 9 ? 1 : 2,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const played = applyPlayedHoleOrder(canonical, 10);

    expect(played[0]).toEqual(expect.objectContaining({ holeNumber: 1, pass: 2, playOrder: 1 }));
    expect(played[8]).toEqual(expect.objectContaining({ holeNumber: 9, pass: 2, playOrder: 9 }));
    expect(played[9]).toEqual(expect.objectContaining({ holeNumber: 1, pass: 1, playOrder: 10 }));
  });

  it('builds scoring buckets and big-number signals from normalized holes', () => {
    const holes = normalizeTrustedHoleSequence({
      holesPlayed: 9,
      roundHoles: [
        { holeNumber: 1, par: 4, score: 3, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 2, par: 4, score: 4, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 3, par: 4, score: 5, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 4, par: 4, score: 6, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 5, par: 4, score: 7, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 6, par: 4, score: 4, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 7, par: 4, score: 4, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 8, par: 4, score: 3, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 9, par: 4, score: 8, pass: 1, firHit: null, girHit: null, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
      ],
    });

    const buckets = getScoringBuckets(holes);
    expect(buckets.birdieOrBetter).toBe(2);
    expect(buckets.par).toBe(3);
    expect(buckets.bogey).toBe(1);
    expect(buckets.doubleOrWorse).toBe(3);
    expect(buckets.tripleOrWorse).toBe(2);
    expect(getBigNumberCount(holes)).toBe(3);
    expect(getWorstHoleDamage(holes)).toBe(4);
    expect(getOneHoleDamageShare(holes)).toBeGreaterThanOrEqual(0.4);
    expect(getVolatilityScore(holes)).toBeGreaterThan(1.2);
  });

  it('computes front/back and par-type splits', () => {
    const input = buildBaseInput({
      roundHoles: [
        { holeNumber: 1, par: 3, score: 4, pass: 1, firHit: null, girHit: 0, putts: 2, penalties: 0, chips: 1, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 2, par: 4, score: 5, pass: 1, firHit: 0, girHit: 0, putts: 2, penalties: 0, chips: 1, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 3, par: 5, score: 4, pass: 1, firHit: 1, girHit: 1, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
        { holeNumber: 4, par: 3, score: 3, pass: 1, firHit: null, girHit: 1, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0, firDirection: null, girDirection: null },
      ],
      holesPlayed: 4,
    });
    const holes = normalizeTrustedHoleSequence({ holesPlayed: 4, roundHoles: input.roundHoles });
    const split = getFrontBackSplit(holes);
    expect(split.frontToPar).toBe(2);
    expect(split.backToPar).toBe(-1);

    const parType = getParTypePerformance(holes);
    expect(parType.par3ToPar).toBe(1);
    expect(parType.par4ToPar).toBe(1);
    expect(parType.par5ToPar).toBe(-1);
  });

  it('applies reliability guards correctly', () => {
    const base = buildBaseInput();
    expect(hasReliableTeeEvidence(base)).toBe(true);
    expect(hasReliableApproachEvidence(base)).toBe(true);
    expect(hasReliablePuttingEvidence(base)).toBe(true);
    expect(hasReliableShortGameEvidence(base)).toBe(true);

    const noPutting = buildBaseInput({ putts: null, girHit: 8 });
    expect(hasReliablePuttingEvidence(noPutting)).toBe(false);
    const noApproach = buildBaseInput({ girHit: null, sgApproach: null });
    expect(hasReliableApproachEvidence(noApproach)).toBe(false);
    const weakShortGame = buildBaseInput({ girHit: 17, chips: 1, greensideBunkerShots: 0, shortGameShots: 1 });
    expect(hasReliableShortGameEvidence(weakShortGame)).toBe(false);

    const par3HeavyNine = buildBaseInput({
      holesPlayed: 9,
      fairwaysPossible: 4,
      firHit: 3,
      sgOffTee: null,
    });
    expect(hasReliableTeeEvidence(par3HeavyNine)).toBe(false);
  });
});
