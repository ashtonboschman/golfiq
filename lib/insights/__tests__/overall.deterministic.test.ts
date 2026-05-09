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
    sgOffTee: 0.2,
    sgApproach: -0.8,
    sgPutting: -0.1,
    sgPenalties: 0.1,
    sgResidual: -0.2,
    sgConfidence: null,
    sgPartialAnalysis: null,
    firDirections: [],
    girDirections: [],
    ...partial,
  };
}

function buildCards(rounds: OverallRoundPoint[], isPremium = true) {
  const payload = computeOverallPayload({
    rounds,
    isPremium,
    model: 'overall-deterministic-v1',
    cards: Array.from({ length: 3 }, () => ''),
  });

  const cards = buildDeterministicOverallCards({
    payload,
    recommendedDrill: 'Use one simple pre-shot routine on every shot.',
    missingStats: { fir: false, gir: false, putts: false, penalties: false },
    isPremium,
    mode: 'combined',
  });

  return { payload, cards };
}

describe('deterministic overall cards phase-2 confidence-depth behavior', () => {
  it('returns exactly three cards and keeps overall role separation language', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
      }),
    );

    const { cards } = buildCards(rounds, true);
    expect(cards).toHaveLength(3);

    const joined = cards.join(' ').toLowerCase();
    expect(joined).not.toContain('next round');
    expect(joined).not.toContain('focus on');
    expect(joined).not.toContain('priority first');
  });

  it('low confidence stays cautious and avoids persistent overstatement', () => {
    const rounds = Array.from({ length: 2 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-02-${String(10 - i).padStart(2, '0')}T12:00:00Z`),
        score: i === 0 ? 82 : 78,
        toPar: i === 0 ? 10 : 6,
      }),
    );

    const { payload, cards } = buildCards(rounds, true);
    expect(payload.confidence).toBe('low');
    expect(cards[0].toLowerCase()).toContain('early');
    expect(cards.join(' ').toLowerCase()).not.toContain('persistent trend');
    expect(cards.join(' ').toLowerCase()).not.toContain('most persistent');
  });

  it('medium confidence uses moderate wording with emerging component framing', () => {
    const rounds = Array.from({ length: 4 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(28 - i).padStart(2, '0')}T12:00:00Z`),
        score: [77, 78, 79, 80][i],
        toPar: [5, 6, 7, 8][i],
      }),
    );

    const { payload, cards } = buildCards(rounds, true);
    expect(payload.confidence).toBe('medium');
    expect(cards[0].toLowerCase()).toContain('the trend is holding steady');
    expect(cards[1].toLowerCase()).toMatch(/emerging|balanced/);
  });

  it('high confidence produces stronger persistent-pattern framing', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => {
      const recent = i < 5;
      return mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: recent ? [81, 82, 80, 83, 81][i] : 77,
        toPar: recent ? [9, 10, 8, 11, 9][i] : 5,
        sgOffTee: recent ? [0.2, -0.2, 0.1, -0.1, 0.2][i] : 0.2,
        sgApproach: recent ? [-1.2, -1.0, -1.1, -0.9, -1.3][i] : -0.4,
        sgPutting: recent ? [-0.2, 0.1, -0.1, 0.1, -0.2][i] : -0.1,
        sgPenalties: recent ? [0.2, 0, 0.1, 0.2, 0.1][i] : 0.1,
      });
    });

    const { payload, cards } = buildCards(rounds, true);
    expect(payload.confidence).toBe('high');
    expect(cards[1]).toContain('most persistent scoring weakness');
    expect(cards[1]).toContain("You're losing about");
  });

  it('recurring but recovering weakness avoids over-decisive persistent framing', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => {
      const recent = i < 5;
      return mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: recent ? [80, 81, 79, 82, 80][i] : 78,
        toPar: recent ? [8, 9, 7, 10, 8][i] : 6,
        sgOffTee: recent ? 0.1 : 0.1,
        sgApproach: recent ? -0.65 : -0.4,
        sgPutting: recent ? -0.2 : -0.1,
        sgPenalties: recent ? 0.1 : 0,
      });
    });

    const { payload, cards } = buildCards(rounds, true);
    expect(payload.confidence).toBe('high');
    expect(cards[1].toLowerCase()).toMatch(/emerging|balanced/);
    expect(cards[1]).not.toContain('most persistent scoring weakness');
  });

  it('balanced golfer still receives useful interpretation instead of a dead-end', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgOffTee: i < 5 ? -0.18 : -0.12,
        sgApproach: i < 5 ? -0.22 : -0.15,
        sgPutting: i < 5 ? -0.2 : -0.14,
        sgPenalties: i < 5 ? -0.16 : -0.1,
      }),
    );

    const { cards } = buildCards(rounds, true);
    const card2 = cards[1].toLowerCase();
    expect(card2).toContain('balanced');
    expect(card2).toContain('marginal');
    expect(card2).not.toContain('nothing stands out');
    expect(card2).not.toContain('no clear reason yet');
  });

  it('balanced profiles still surface a slight relative weakness when one area is clearly weakest', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgOffTee: i < 5 ? 0.35 : 0.2,
        sgApproach: i < 5 ? -0.2 : -0.08,
        sgPutting: i < 5 ? -0.06 : -0.04,
        sgPenalties: i < 5 ? -0.04 : -0.02,
      }),
    );
    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: ['', '', ''],
    });
    payload.mode_payload.combined.narrative.opportunity = {
      name: 'approach',
      value: -0.2,
      label: 'Approach',
      isWeakness: true,
      coverageRecent: 5,
      lowCoverage: false,
    };
    payload.mode_payload.combined.narrative.strength = {
      name: 'off_tee',
      value: 0.35,
      label: 'Off the Tee',
      coverageRecent: 5,
      lowCoverage: false,
    };
    payload.mode_payload.combined.sgComponents = {
      hasData: true,
      recentAvg: {
        total: 0,
        offTee: 0.35,
        approach: -0.2,
        putting: -0.06,
        penalties: -0.04,
        residual: 0,
      },
      baselineAvg: {
        total: 0,
        offTee: 0,
        approach: 0,
        putting: 0,
        penalties: 0,
        residual: 0,
      },
    };

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      mode: 'combined',
    });

    expect(cards[1]).toContain('weakest relative area');
    expect(cards[1]).toContain('Approach');
    expect(cards[1]).toContain('fairly balanced');
  });

  it('volatility can become the actual overall insight with ceiling-floor interpretation', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        score: i < 5 ? [71, 84, 73, 85, 72][i] : 77,
        toPar: i < 5 ? [-1, 12, 1, 13, 0][i] : 5,
      }),
    );

    const { payload, cards } = buildCards(rounds, true);
    expect(payload.confidence).toBe('high');
    expect(cards[2].toLowerCase()).toContain('ceiling is strong');
    expect(cards[2].toLowerCase()).toContain('volatility');
  });

  it('score-only golfer still gets useful but cautious overall interpretation', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        sgTotal: null,
        sgOffTee: null,
        sgApproach: null,
        sgPutting: null,
        sgPenalties: null,
        sgResidual: null,
      }),
    );

    const { payload, cards } = buildCards(rounds, false);
    expect(payload.confidence).toBe('medium');
    expect(cards[1].toLowerCase()).toContain('shot-pattern detail');
    expect(cards[1].toLowerCase()).toContain('logging fairways');
  });

  it('premium is sharper than free and not only longer', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => {
      const recent = i < 5;
      return mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        sgApproach: recent ? -1.1 : -0.3,
        sgOffTee: recent ? 0.2 : 0.1,
        sgPutting: recent ? -0.2 : -0.1,
        sgPenalties: recent ? 0.1 : 0,
      });
    });

    const premium = buildCards(rounds, true).cards[1];
    const free = buildCards(rounds, false).cards[1];

    expect(premium).toContain("You're losing about");
    expect(premium).toMatch(/persistent|emerging/);
    expect(free).toMatch(/persistent|emerging/);
    expect(free).not.toContain("You're losing about");
  });

  it('does not add directional qualifier when directional sample is tiny', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        firDirections: i === 0 ? ['miss_left', 'miss_left'] : [],
        girDirections: [],
      }),
    );

    const { cards } = buildCards(rounds, true);
    const text = cards[1].toLowerCase();
    expect(text).not.toContain('recent fir misses');
    expect(text).not.toContain('recent gir misses');
  });

  it('does not add directional qualifier when direction is mixed/noisy', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        firDirections: i < 5 ? ['miss_left', 'miss_left', 'miss_right', 'miss_right'] : [],
      }),
    );

    const { cards } = buildCards(rounds, true);
    const text = cards[1].toLowerCase();
    expect(text).not.toContain('recent fir misses');
    expect(text).not.toContain('recent gir misses');
  });

  it('adds directional qualifier when recent misses show a clear skew', () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      mkRound({
        id: BigInt(i + 1),
        date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
        girDirections: i < 5 ? ['miss_short', 'miss_short', 'miss_short', 'miss_right'] : [],
      }),
    );

    const premium = buildCards(rounds, true).cards[1].toLowerCase();
    const free = buildCards(rounds, false).cards[1].toLowerCase();
    expect(premium).toContain('recent gir misses');
    expect(premium).toContain('recorded misses');
    expect(free).toContain('recent gir misses');
    expect(free).not.toContain('recorded misses');
  });
});

