import {
  normalizeByMode,
  decorateCardEmojis,
  shouldAutoRefreshOverall,
  type OverallRoundPoint,
} from '../overall';

function mkRound(partial: Partial<OverallRoundPoint>): OverallRoundPoint {
  return {
    id: BigInt(1),
    date: new Date('2026-02-01T12:00:00Z'),
    holes: 18,
    nonPar3Holes: 14,
    score: 90,
    toPar: 18,
    firHit: 6,
    girHit: 7,
    putts: 36,
    penalties: 2,
    handicapAtRound: 16.2,
    sgTotal: 0,
    sgOffTee: 0,
    sgApproach: 0,
    sgPutting: 0,
    sgPenalties: 0,
    sgResidual: 0,
    sgConfidence: null,
    sgPartialAnalysis: null,
    ...partial,
  };
}

describe('overall insights helpers', () => {
  it('doubles 9-hole rounds in combined mode', () => {
    const nine = mkRound({
      holes: 9,
      nonPar3Holes: 5,
      score: 44,
      toPar: 8,
      firHit: 3,
      girHit: 4,
      putts: 18,
      penalties: 1,
      sgTotal: -0.5,
    });
    const out = normalizeByMode([nine], 'combined');
    expect(out[0].holes).toBe(18);
    expect(out[0].score).toBe(88);
    expect(out[0].putts).toBe(36);
    expect(out[0].sgTotal).toBe(-1);
  });

  it('filters 9-hole and 18-hole modes', () => {
    const nine = mkRound({ id: BigInt(1), holes: 9 });
    const eighteen = mkRound({ id: BigInt(2), holes: 18 });
    expect(normalizeByMode([nine, eighteen], '9').map((r) => r.holes)).toEqual([9]);
    expect(normalizeByMode([nine, eighteen], '18').map((r) => r.holes)).toEqual([18]);
  });

  it('decorates emojis in fixed order', () => {
    const cards = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
    const out = decorateCardEmojis(cards, 'great', true);
    expect(out[0].startsWith('🔥 ')).toBe(true);
    expect(out[1].startsWith('⚠️ ')).toBe(true);
    expect(out[2].startsWith('ℹ️ ')).toBe(true);
  });

  it('only auto-refreshes when week changed and hash changed', () => {
    const old = new Date('2026-01-31T12:00:00Z');
    expect(shouldAutoRefreshOverall(old, 'abc', 'abc')).toBe(false);
    expect(shouldAutoRefreshOverall(null, null, 'abc')).toBe(true);
  });
});
