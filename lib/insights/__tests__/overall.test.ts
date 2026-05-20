import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  normalizeByMode,
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
    firDirections: [],
    girDirections: [],
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

  it('builds exactly 3 deterministic overall cards without emojis', () => {
    const rounds = [
      mkRound({
        score: 78,
        toPar: 6,
        sgTotal: -1.2,
        sgOffTee: 0.3,
        sgApproach: -0.8,
        sgPutting: -0.5,
        sgPenalties: -0.2,
      }),
      mkRound({
        id: BigInt(2),
        date: new Date('2026-01-28T12:00:00Z'),
        score: 76,
        toPar: 4,
        sgTotal: -0.5,
        sgOffTee: 0.2,
        sgApproach: -0.4,
        sgPutting: -0.3,
        sgPenalties: 0,
      }),
    ];

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
    });

    expect(cards).toHaveLength(3);
    cards.forEach((card) => {
      expect(card.startsWith('?')).toBe(false);
      expect(card.startsWith('??')).toBe(false);
      expect(card.startsWith('??')).toBe(false);
      expect(card.startsWith('??')).toBe(false);
    });
  });

  it('auto-refreshes whenever data hash changes', () => {
    const old = new Date('2026-01-31T12:00:00Z');
    expect(shouldAutoRefreshOverall(old, 'abc', 'abc')).toBe(false);
    expect(shouldAutoRefreshOverall(old, 'abc', 'def')).toBe(true);
    expect(shouldAutoRefreshOverall(null, null, 'abc')).toBe(true);
  });

  it('suppresses short-game opportunity when recent missed-green opportunities are below guard', () => {
    const rounds = Array.from({ length: 5 }, (_, index) =>
      mkRound({
        id: BigInt(index + 1),
        date: new Date(`2026-01-${String(31 - index).padStart(2, '0')}T12:00:00Z`),
        holes: 18,
        nonPar3Holes: 14,
        girHit: 16, // only 2 missed greens (< 4 guard)
        sgOffTee: -0.2,
        sgApproach: -0.1,
        sgShortGame: -1.8,
        sgPutting: -0.1,
        sgPenalties: -0.1,
        sgResidual: 0,
      }),
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.mode_payload.combined.sgComponents?.recentAvg.shortGame).toBeNull();
    expect(payload.mode_payload.combined.sgComponents?.baselineAvg.shortGame).toBeNull();
    expect(payload.mode_payload.combined.narrative.opportunity.name).not.toBe('short_game');
  });

  it('keeps short-game opportunity eligible when enough recent rounds meet opportunity guard', () => {
    const rounds = [
      mkRound({
        id: BigInt(1),
        date: new Date('2026-01-31T12:00:00Z'),
        holes: 18,
        nonPar3Holes: 14,
        girHit: 11, // 7 missed greens
        sgOffTee: 0.1,
        sgApproach: 0.1,
        sgShortGame: -1.5,
        sgPutting: 0.1,
        sgPenalties: 0.1,
        sgResidual: 0,
      }),
      mkRound({
        id: BigInt(2),
        date: new Date('2026-01-30T12:00:00Z'),
        holes: 18,
        nonPar3Holes: 14,
        girHit: 12, // 6 missed greens
        sgOffTee: 0.2,
        sgApproach: 0.1,
        sgShortGame: -1.2,
        sgPutting: 0.1,
        sgPenalties: 0.1,
        sgResidual: 0,
      }),
      mkRound({
        id: BigInt(3),
        date: new Date('2026-01-29T12:00:00Z'),
        holes: 18,
        nonPar3Holes: 14,
        girHit: 16,
        sgOffTee: 0.1,
        sgApproach: 0.1,
        sgShortGame: -1.0,
        sgPutting: 0.1,
        sgPenalties: 0.1,
        sgResidual: 0,
      }),
      mkRound({
        id: BigInt(4),
        date: new Date('2026-01-28T12:00:00Z'),
        holes: 18,
        nonPar3Holes: 14,
        girHit: 16,
        sgOffTee: 0.2,
        sgApproach: 0.2,
        sgShortGame: -0.8,
        sgPutting: 0.2,
        sgPenalties: 0.2,
        sgResidual: 0,
      }),
      mkRound({
        id: BigInt(5),
        date: new Date('2026-01-27T12:00:00Z'),
        holes: 18,
        nonPar3Holes: 14,
        girHit: 16,
        sgOffTee: 0.1,
        sgApproach: 0.2,
        sgShortGame: -0.7,
        sgPutting: 0.1,
        sgPenalties: 0.1,
        sgResidual: 0,
      }),
    ];

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.mode_payload.combined.sgComponents?.recentAvg.shortGame).not.toBeNull();
    expect(payload.mode_payload.combined.narrative.opportunity.name).toBe('short_game');
  });
});


