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
    firDirections: [],
    girDirections: [],
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('worsening');
  });

  it('does not classify worsening for improving demo-style profile with a noisy final-5 slope', () => {
    const rounds = buildRounds(
      [
        80, 81, 83, 82, 77,
        83, 81, 85, 80, 84,
        83, 82, 84, 86, 84,
        91, 86, 89, 88, 93,
        91, 90, 96, 92, 95,
      ],
      Array.from({ length: 25 }, (_, idx) => 10.8 + idx * 0.3),
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v2',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.analysis.avg_score_recent).toBeCloseTo(80.6, 1);
    expect(payload.analysis.avg_score_baseline).toBeCloseTo(85.8, 1);
    expect(payload.projection.trajectory).toBe('improving');
  });

  it('resolves conflicting local-slope signals to non-worsening when recent average beats baseline windows', () => {
    const rounds = buildRounds(
      [80, 81, 83, 82, 77, 90, 89, 91, 88, 92],
      [10.8, 11.1, 11.4, 11.6, 11.9, 14.2, 14.6, 15.0, 15.3, 15.7],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v2',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.analysis.avg_score_recent).toBeCloseTo(80.6, 1);
    expect(payload.analysis.avg_score_baseline).toBeCloseTo(85.3, 1);
    expect(payload.projection.trajectory).toBe('improving');
  });

  it('classifies flat trajectory when recent and baseline averages are nearly equal', () => {
    const rounds = buildRounds(
      [74, 74, 75, 74, 75, 74, 75, 74, 75, 74],
      [4.2, 4.2, 4.1, 4.2, 4.2, 4.1, 4.2, 4.2, 4.1, 4.2],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('flat');
  });

  it('classifies flat when recent scoring is within threshold of previous/history baselines', () => {
    const rounds = buildRounds(
      [84, 85, 84, 85, 84, 84, 85, 84, 85, 84, 83, 84, 85, 84, 85],
      [6.1, 6.1, 6.2, 6.2, 6.3, 6.3, 6.4, 6.4, 6.5, 6.5, 6.6, 6.6, 6.7, 6.7, 6.8],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v2',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('flat');
  });

  it('keeps trajectory in building state for early samples (5 rounds or fewer)', () => {
    const rounds = buildRounds(
      [79, 78, 77, 76, 75],
      [6.8, 6.7, 6.6, 6.5, 6.4],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('unknown');
  });

  it('keeps trajectory in building state for 6-9 rounds even with worsening slope', () => {
    const rounds = buildRounds(
      [92, 104, 88, 92, 90, 120],
      [21.0, 21.0, 20.8, 20.7, 20.6, 20.5],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.analysis.avg_score_recent).toBeCloseTo(93.2, 1);
    expect(payload.analysis.avg_score_baseline).toBeCloseTo(97.7, 1);
    expect(payload.projection.trajectory).toBe('unknown');
  });

  it('keeps projection ranges centered around projected score/handicap (low handicap case)', () => {
    const rounds = buildRounds(
      [73, 74, 73, 74, 75, 74, 73, 74, 75, 74],
      [1.9, 2.0, 2.1, 1.8, 2.2, 2.0, 1.7, 2.1, 2.3, 1.9],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
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
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
      currentHandicapOverride: 2.8,
    });

    expect(payload.projection.handicapCurrent).toBeCloseTo(2.8, 1);
    expect(payload.projection.projectedHandicapIn10).not.toBeNull();
    expect(payload.projection_ranges).toBeDefined();
    expect(payload.projection_ranges!.handicapLow!).toBeGreaterThanOrEqual(1.8);
  });

  it('falls back to latest handicap snapshot when currentHandicapOverride is null', () => {
    const rounds = buildRounds(
      [74, 74, 73, 74, 75, 74, 73, 74, 75, 74],
      [2.8, 2.9, 3.1, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
      currentHandicapOverride: null,
    });

    expect(payload.projection.handicapCurrent).toBeCloseTo(2.8, 1);
    expect(payload.projection.projectedHandicapIn10).not.toBeNull();
    expect(payload.projection_ranges).toBeDefined();
  });

  it('uses post-round handicap for the latest handicap trend point', () => {
    const rounds = buildRounds(
      [74, 75, 76],
      [10.0, 9.0, 8.0],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
      currentHandicapOverride: 10.5,
    });

    const trend = payload.handicap_trend.handicap;
    expect(trend).toHaveLength(3);
    expect(trend[trend.length - 1]).toBeCloseTo(10.5, 1);
    expect(trend[trend.length - 2]).toBeCloseTo(10.0, 1);
  });

  it('keeps handicap projection direction aligned for improving trajectory even if handicap slope rises', () => {
    const rounds = buildRounds(
      [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
      [5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.8, 4.7, 4.6],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('improving');
    expect(payload.projection.handicapCurrent).toBeCloseTo(5.5, 1);
    expect(payload.projection.projectedHandicapIn10).toBeLessThanOrEqual(
      payload.projection.handicapCurrent!,
    );
  });

  it('keeps projected handicap from moving opposite score direction when score projection improves', () => {
    const rounds = buildRounds(
      [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
      [5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.8, 4.7, 4.6],
    );

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 3 }, () => ''),
    });

    expect(payload.projection.projectedScoreIn10).toBeLessThan(75);
    expect(payload.projection.projectedHandicapIn10).toBeLessThanOrEqual(
      payload.projection.handicapCurrent!,
    );
    expect(payload.projection_ranges).toBeDefined();
  });
});


