import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  type OverallRoundPoint,
} from '../overall';

const BANNED_TOKENS = [
  'not enough data',
  'insufficient',
  'priority first',
  'on-course strategy',
  'projection:',
  'shot window',
  'dispersion',
  'corridor',
  'variance',
  'execution',
  'insufficient data',
  '+/-0.0',
  'about 0.0',
] as const;

function mkRound(partial: Partial<OverallRoundPoint>): OverallRoundPoint {
  return {
    id: BigInt(1),
    date: new Date('2026-02-01T12:00:00Z'),
    holes: 18,
    nonPar3Holes: 14,
    score: 78,
    toPar: 6,
    firHit: 8,
    girHit: 9,
    putts: 33,
    penalties: 1,
    handicapAtRound: 12.4,
    sgTotal: -0.2,
    sgOffTee: 0.3,
    sgApproach: -0.8,
    sgPutting: -0.1,
    sgPenalties: 0.2,
    sgResidual: -0.5,
    sgConfidence: null,
    sgPartialAnalysis: null,
    firDirections: [],
    girDirections: [],
    ...partial,
  };
}

describe('overall copy smoke (3-card system)', () => {
  it('keeps copy clean and limited to the new 3-card model', () => {
    const rounds = Array.from({ length: 12 }, (_, index) =>
      mkRound({
        id: BigInt(index + 1),
        date: new Date(`2026-01-${String(31 - index).padStart(2, '0')}T12:00:00Z`),
      }),
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Set a start-line gate and hit 10 reps.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards).toHaveLength(3);

    const joined = cards.join(' ').toLowerCase();
    expect(joined).toContain('normal scoring range');
    BANNED_TOKENS.forEach((token) => expect(joined).not.toContain(token));
    expect(joined).not.toContain('baseline');
  });
});

