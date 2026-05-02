import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  type OverallRoundPoint,
} from '../overall';

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
    sgOffTee: 0.4,
    sgApproach: -0.6,
    sgPutting: 0.2,
    sgPenalties: 0.1,
    sgResidual: -0.3,
    sgConfidence: null,
    sgPartialAnalysis: null,
    ...partial,
  };
}

describe('deterministic overall cards (3-card system)', () => {
  it('returns exactly 3 cards', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards).toHaveLength(3);
  });

  it('does not emit legacy card concepts', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    const joined = cards.join(' ');
    expect(joined).not.toContain('Priority first');
    expect(joined).not.toContain('On-course strategy');
    expect(joined).not.toContain('Projection:');
    expect(joined.toLowerCase()).not.toContain('insufficient');
    expect(joined.toLowerCase()).not.toContain('not enough data');
    expect(joined.toLowerCase()).not.toContain('baseline');
  });

  it('free driver card has no SG numeric precision while premium can include it', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgApproach: i < 5 ? -1.2 : -0.2,
      }),
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    const freeCards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: false,
      mode: 'combined',
    });

    const premiumCards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(freeCards[1]).toContain('The full breakdown shows exactly how much.');
    expect(freeCards[1]).not.toMatch(/\b\d+(\.\d)? strokes\b/i);
    expect(freeCards[1]).not.toMatch(/\bstrokes per round\b/i);
    expect(premiumCards[1]).toMatch(/about\s+\d+(\.\d)?\s+strokes/i);
    expect(premiumCards[1]).not.toContain('The full breakdown shows exactly how much.');
  });

  it('treats near-zero component delta as balanced for premium (no about 0.0 strokes)', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgApproach: i < 5 ? -0.41 : -0.4,
        sgOffTee: i < 5 ? 0.2 : 0.2,
        sgPutting: i < 5 ? 0.1 : 0.1,
        sgPenalties: i < 5 ? 0 : 0,
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[1]).toBe('Your game is well balanced. No area clearly stands out as a weakness.');
    expect(cards[1]).not.toMatch(/about\s+0\.0\s+strokes/i);
  });

  it('uses inconsistency wording when stdDev is above 2.5', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: i < 5 ? [72, 80, 74, 83, 76][i] : 78,
        toPar: i < 5 ? [0, 8, 2, 11, 4][i] : 6,
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[2]).toBe('Your scoring is inconsistent. Your scores are varying more than usual from round to round.');
  });

  it('uses consistent wording when stdDev is 1.4', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: i < 5 ? [78, 80, 79, 81, 80][i] : 80,
        toPar: i < 5 ? [6, 8, 7, 9, 8][i] : 8,
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[2]).toContain('Your scoring is consistent.');
  });

  it('uses some-movement wording when stdDev is 2.0', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: i < 5 ? [77, 81, 79, 82, 80][i] : 80,
        toPar: i < 5 ? [5, 9, 7, 10, 8][i] : 8,
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[2]).toBe('Your scoring has some movement. Your scores are moving around, but not wildly from round to round.');
  });

  it('uses forming wording when consistency is insufficient', () => {
    const payload = computeOverallPayload({
      rounds: [mkRound({ score: 82, toPar: 10 })],
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: true, penalties: true },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[2]).toBe('Consistency is still forming. A few more rounds will show how steady your scoring really is.');
  });

  it("uses contractions in card 1 ('You're scoring...')", () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: i < 5 ? 74 : 80,
        toPar: i < 5 ? 2 : 8,
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[0]).toContain('outperforming your usual level');
    expect(cards[0]).toContain("You're scoring about");
    expect(cards[0]).not.toContain('You are scoring about');
  });

  it("uses contractions in premium card 2 ('You're losing/gaining...')", () => {
    const improvingDriverRounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgApproach: i < 5 ? -1.2 : -0.2,
      }),
    );
    const worseningDriverRounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(100 + i),
        date: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T12:00:00Z`),
        sgApproach: i < 5 ? 1.2 : 0.2,
        sgOffTee: i < 5 ? 1.1 : 0.1,
        sgPutting: i < 5 ? 1.0 : 0.1,
        sgPenalties: i < 5 ? 0.6 : 0.1,
        sgResidual: i < 5 ? 0.5 : 0.1,
      }),
    );

    const improvingPayload = computeOverallPayload({
      rounds: improvingDriverRounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    const worseningPayload = computeOverallPayload({
      rounds: worseningDriverRounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    const improvingCards = buildDeterministicOverallCards({
      payload: improvingPayload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });
    const worseningCards = buildDeterministicOverallCards({
      payload: worseningPayload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(improvingCards[1]).toContain("You're losing about");
    expect(improvingCards[1]).not.toContain('You are losing about');
    expect(worseningCards[1]).toContain("You're gaining about");
    expect(worseningCards[1]).not.toContain('You are gaining about');
  });

  it('does not add bridge sentence to balanced/no-driver/strength free card 2', () => {
    const balancedRounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgApproach: i < 5 ? -0.41 : -0.4,
        sgOffTee: 0.2,
        sgPutting: 0.1,
        sgPenalties: 0,
      }),
    );
    const noDriverRounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(100 + i),
        date: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T12:00:00Z`),
        sgTotal: null,
        sgOffTee: null,
        sgApproach: null,
        sgPutting: null,
        sgPenalties: null,
        sgResidual: null,
      }),
    );
    const strengthRounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(200 + i),
        date: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T12:00:00Z`),
        sgOffTee: i < 5 ? 1.2 : 0.2,
        sgApproach: i < 5 ? 0.4 : 0.2,
        sgPutting: i < 5 ? 0.3 : 0.2,
        sgPenalties: i < 5 ? 0.1 : 0,
        sgResidual: i < 5 ? 0.2 : 0.1,
      }),
    );

    const balancedCards = buildDeterministicOverallCards({
      payload: computeOverallPayload({
        rounds: balancedRounds,
        isPremium: true,
        model: 'overall-deterministic-v1',
        cards: Array.from({ length: 3 }, () => ''),
      }),
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: false,
      mode: 'combined',
    });
    const noDriverCards = buildDeterministicOverallCards({
      payload: computeOverallPayload({
        rounds: noDriverRounds,
        isPremium: true,
        model: 'overall-deterministic-v1',
        cards: Array.from({ length: 3 }, () => ''),
      }),
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: false,
      mode: 'combined',
    });
    const strengthCards = buildDeterministicOverallCards({
      payload: computeOverallPayload({
        rounds: strengthRounds,
        isPremium: true,
        model: 'overall-deterministic-v1',
        cards: Array.from({ length: 3 }, () => ''),
      }),
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: false,
      mode: 'combined',
    });

    expect(balancedCards[1]).toBe('Your game is well balanced. No area clearly stands out as a weakness.');
    expect(noDriverCards[1]).toContain('No clear reason yet.');
    expect(strengthCards[1]).toContain('is helping your score.');
    [balancedCards[1], noDriverCards[1], strengthCards[1]].forEach((card) => {
      expect(card).not.toContain('The full breakdown shows exactly how much.');
      expect(card).not.toMatch(/\bstrokes per round\b/i);
    });
  });

  it('uses ultra-stable copy for stdDev of 0.0', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: i < 5 ? 80 : 80,
        toPar: i < 5 ? 8 : 8,
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
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[2]).toBe('Your scoring is extremely consistent. Your scores have been steady from round to round.');
    expect(cards[2]).not.toContain('+/-0.0');
  });

  it('uses ultra-stable copy for stdDev of 0.04', () => {
    const payload = computeOverallPayload({
      rounds: Array.from({ length: 10 }, (_, i) => mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
      })),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    payload.consistency = { label: 'stable', stdDev: 0.04 };
    payload.mode_payload.combined.consistency = { label: 'stable', stdDev: 0.04 };

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[2]).toBe('Your scoring is extremely consistent. Your scores have been steady from round to round.');
    expect(cards[2]).not.toContain('+/-0.0');
  });

  it('uses very-consistent copy for stdDev in [0.05, 0.1)', () => {
    const payloadAt005 = computeOverallPayload({
      rounds: Array.from({ length: 10 }, (_, i) => mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
      })),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    payloadAt005.consistency = { label: 'stable', stdDev: 0.05 };
    payloadAt005.mode_payload.combined.consistency = { label: 'stable', stdDev: 0.05 };

    const payloadAt009 = computeOverallPayload({
      rounds: Array.from({ length: 10 }, (_, i) => mkRound({
        id: BigInt(100 + i),
        date: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T12:00:00Z`),
      })),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    payloadAt009.consistency = { label: 'stable', stdDev: 0.09 };
    payloadAt009.mode_payload.combined.consistency = { label: 'stable', stdDev: 0.09 };

    const cardsAt005 = buildDeterministicOverallCards({
      payload: payloadAt005,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });
    const cardsAt009 = buildDeterministicOverallCards({
      payload: payloadAt009,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cardsAt005[2]).toBe('Your scoring is very consistent. Your scores have barely changed from round to round.');
    expect(cardsAt009[2]).toBe('Your scoring is very consistent. Your scores have barely changed from round to round.');
    expect(cardsAt005[2]).not.toContain('+/-0.0');
    expect(cardsAt009[2]).not.toContain('+/-0.0');
  });

  it('does not use numeric consistent copy for stdDev below 0.2', () => {
    const payloadAt01 = computeOverallPayload({
      rounds: Array.from({ length: 10 }, (_, i) => mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
      })),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    payloadAt01.consistency = { label: 'stable', stdDev: 0.1 };
    payloadAt01.mode_payload.combined.consistency = { label: 'stable', stdDev: 0.1 };
    const cardsAt01 = buildDeterministicOverallCards({
      payload: payloadAt01,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cardsAt01[2]).toBe('Your scoring is very consistent. Your scores have barely changed from round to round.');
    expect(cardsAt01[2]).not.toContain('+/-');

    const payloadAt019 = computeOverallPayload({
      rounds: Array.from({ length: 10 }, (_, i) => mkRound({
        id: BigInt(100 + i),
        date: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T12:00:00Z`),
      })),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    payloadAt019.consistency = { label: 'stable', stdDev: 0.19 };
    payloadAt019.mode_payload.combined.consistency = { label: 'stable', stdDev: 0.19 };
    const cardsAt019 = buildDeterministicOverallCards({
      payload: payloadAt019,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });
    expect(cardsAt019[2]).toBe('Your scoring is very consistent. Your scores have barely changed from round to round.');
    expect(cardsAt019[2]).not.toContain('+/-');
  });

  it('uses numeric consistent copy when stdDev is 0.2 or higher', () => {
    const payloadAt02 = computeOverallPayload({
      rounds: Array.from({ length: 10 }, (_, i) => mkRound({
        id: BigInt(200 + i),
        date: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T12:00:00Z`),
      })),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });
    payloadAt02.consistency = { label: 'stable', stdDev: 0.2 };
    payloadAt02.mode_payload.combined.consistency = { label: 'stable', stdDev: 0.2 };
    const cardsAt02 = buildDeterministicOverallCards({
      payload: payloadAt02,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });
    expect(cardsAt02[2]).toContain('Your scoring is consistent.');
    expect(cardsAt02[2]).toContain('+/-0.2');
  });

  it('early/low-data trend copy appears when mode has insufficient rounds', () => {
    const payload = computeOverallPayload({
      rounds: [mkRound({ holes: 9, nonPar3Holes: 7, score: 46, toPar: 10 })],
      isPremium: false,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: true, penalties: true },
      isPremium: false,
      mode: 'combined',
    });

    expect(cards[0]).toContain('Early trends are forming.');
  });
});
