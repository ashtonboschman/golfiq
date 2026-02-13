import { computeOverallPayload, type OverallRoundPoint } from '../overall';

function mkRound(index: number, partial: Partial<OverallRoundPoint>): OverallRoundPoint {
  const base = new Date('2026-02-12T12:00:00Z').getTime();
  const date = new Date(base - index * 24 * 60 * 60 * 1000);
  return {
    id: BigInt(index + 1),
    date,
    holes: 18,
    nonPar3Holes: 14,
    score: 75,
    toPar: 3,
    firHit: 8,
    girHit: 9,
    putts: 32,
    penalties: 1,
    handicapAtRound: 6.2,
    sgTotal: -0.2,
    sgOffTee: 0.1,
    sgApproach: -0.2,
    sgPutting: -0.1,
    sgPenalties: 0,
    sgResidual: 0,
    sgConfidence: null,
    sgPartialAnalysis: null,
    ...partial,
  };
}

function buildRounds(scoresNewestFirst: number[], handicapsNewestFirst: number[]): OverallRoundPoint[] {
  return scoresNewestFirst.map((score, index) =>
    mkRound(index, {
      score,
      toPar: score - 72,
      handicapAtRound: handicapsNewestFirst[index] ?? null,
    }),
  );
}

describe('overall projection + trajectory', () => {
  it('computes score projection per mode (combined vs 9 vs 18)', () => {
    const rounds: OverallRoundPoint[] = [];
    for (let i = 0; i < 10; i++) {
      rounds.push(
        mkRound(i, {
          holes: 18,
          nonPar3Holes: 14,
          score: 74 + (i % 2),
          toPar: 2 + (i % 2),
          handicapAtRound: 3.2 + (i * 0.02),
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      rounds.push(
        mkRound(20 + i, {
          holes: 9,
          nonPar3Holes: 7,
          score: 42 + (i % 2),
          toPar: 6 + (i % 2),
          handicapAtRound: 3.2 + (i * 0.02),
        }),
      );
    }

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection_by_mode.combined.projectedScoreIn10).not.toBeNull();
    expect(payload.projection_by_mode['9'].projectedScoreIn10).not.toBeNull();
    expect(payload.projection_by_mode['18'].projectedScoreIn10).not.toBeNull();
    expect(payload.projection_by_mode['9'].projectedScoreIn10!).toBeLessThan(
      payload.projection_by_mode['18'].projectedScoreIn10!,
    );
  });

  it('classifies improving trajectory when recent scoring slope is down', () => {
    const rounds = buildRounds(
      [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
      [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('improving');
  });

  it('classifies worsening trajectory when recent scoring slope is up', () => {
    const rounds = buildRounds(
      [79, 78, 77, 76, 75, 74, 73, 72, 71, 70],
      [6.8, 6.7, 6.6, 6.5, 6.4, 6.3, 6.2, 6.1, 6.0, 5.9],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('worsening');
  });

  it('classifies flat trajectory when recent and baseline averages are nearly equal', () => {
    const rounds = buildRounds(
      [74, 74, 75, 74, 75, 74, 75, 74, 75, 74],
      [4.2, 4.2, 4.1, 4.2, 4.2, 4.1, 4.2, 4.2, 4.1, 4.2],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('flat');
  });

  it('keeps projection ranges centered around projected score/handicap (low handicap case)', () => {
    const rounds = buildRounds(
      [73, 74, 73, 74, 75, 74, 73, 74, 75, 74],
      [1.9, 2.0, 2.1, 1.8, 2.2, 2.0, 1.7, 2.1, 2.3, 1.9],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.projectedScoreIn10).not.toBeNull();
    expect(payload.projection.projectedHandicapIn10).not.toBeNull();
    expect(payload.projection_ranges).toBeDefined();

    const ranges = payload.projection_ranges!;
    const scoreMid = (ranges.scoreLow! + ranges.scoreHigh!) / 2;
    const handicapMid = (ranges.handicapLow! + ranges.handicapHigh!) / 2;

    expect(scoreMid).toBeCloseTo(payload.projection.projectedScoreIn10!, 1);
    expect(handicapMid).toBeCloseTo(payload.projection.projectedHandicapIn10!, 1);
    expect(ranges.handicapLow!).toBeGreaterThanOrEqual(1);
    expect(ranges.handicapHigh!).toBeLessThanOrEqual(2.8);
  });

  it('floors handicap low range to avoid overly optimistic 10-round drop', () => {
    const rounds = buildRounds(
      [74, 74, 73, 74, 75, 74, 73, 74, 75, 74],
      [2.8, 2.9, 3.1, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.handicapCurrent).toBeCloseTo(2.8, 1);
    expect(payload.projection_ranges).toBeDefined();
    const ranges = payload.projection_ranges!;
    expect(ranges.handicapLow!).toBeGreaterThanOrEqual(1.8);
  });

  it('does not expose projections/ranges until premium has at least 10 rounds', () => {
    const rounds = buildRounds(
      [74, 75, 74, 76, 75, 74, 75, 74, 76],
      [5.1, 5.2, 5.1, 5.3, 5.2, 5.1, 5.2, 5.1, 5.3],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.projectedScoreIn10).toBeNull();
    expect(payload.projection.projectedHandicapIn10).toBeNull();
    expect(payload.projection_ranges).toBeUndefined();
  });

  it('does not project handicap when latest round has no handicap snapshot', () => {
    const rounds = buildRounds(
      [74, 74, 73, 74, 75, 74, 73, 74, 75, 74],
      [2.8, 2.9, 3.1, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0],
    ).map((r, idx) => (idx === 0 ? { ...r, handicapAtRound: null } : r));

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.projectedScoreIn10).not.toBeNull();
    expect(payload.projection.handicapCurrent).toBeNull();
    expect(payload.projection.projectedHandicapIn10).toBeNull();
    expect(payload.projection_ranges).toBeUndefined();
  });

  it('uses currentHandicapOverride as projection anchor when provided', () => {
    const rounds = buildRounds(
      [74, 74, 73, 74, 75, 74, 73, 74, 75, 74],
      [1.1, 1.2, 1.4, 1.6, 1.7, 1.9, 2.0, 2.2, 2.3, 2.4],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
      currentHandicapOverride: 2.8,
    });

    expect(payload.projection.handicapCurrent).toBeCloseTo(2.8, 1);
    expect(payload.projection.projectedHandicapIn10).not.toBeNull();
    expect(payload.projection_ranges).toBeDefined();
    expect(payload.projection_ranges!.handicapLow!).toBeGreaterThanOrEqual(1.8);
  });
});
