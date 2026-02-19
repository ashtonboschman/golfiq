import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  type OverallRoundPoint,
} from '../overall';

function mkRound(index: number, partial: Partial<OverallRoundPoint> = {}): OverallRoundPoint {
  const base = new Date('2026-02-12T12:00:00Z').getTime();
  return {
    id: BigInt(index + 1),
    date: new Date(base - index * 24 * 60 * 60 * 1000),
    holes: 18,
    nonPar3Holes: 14,
    score: 78,
    toPar: 6,
    firHit: 8,
    girHit: 9,
    putts: 32,
    penalties: 1,
    handicapAtRound: 9.8,
    sgTotal: -0.1,
    sgOffTee: 0.6,
    sgApproach: -0.4,
    sgPutting: -0.1,
    sgPenalties: 0.2,
    sgResidual: -0.2,
    sgConfidence: null,
    sgPartialAnalysis: null,
    ...partial,
  };
}

function buildFiveRounds(): OverallRoundPoint[] {
  return Array.from({ length: 5 }, (_, i) => mkRound(i));
}

describe('overall insights first-5-round behavior', () => {
  it('uses absolute recent SG values for strength/opportunity and yields zero SG component deltas at <=5 rounds', () => {
    const rounds = buildFiveRounds();
    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.analysis.strength.name).toBe('off_tee');
    expect(payload.analysis.strength.value).toBe(0.6);
    expect(payload.analysis.opportunity.name).toBe('approach');
    expect(payload.analysis.opportunity.value).toBe(-0.4);

    const sg = payload.mode_payload.combined.sgComponents;
    expect(sg).toBeDefined();
    expect(sg!.recentAvg.offTee).toBeCloseTo(sg!.baselineAvg.offTee!, 6);
    expect(sg!.recentAvg.approach).toBeCloseTo(sg!.baselineAvg.approach!, 6);
    expect(sg!.recentAvg.putting).toBeCloseTo(sg!.baselineAvg.putting!, 6);
    expect(sg!.recentAvg.penalties).toBeCloseTo(sg!.baselineAvg.penalties!, 6);
  });

  it('shows card-1 baseline comparison copy (not unavailable copy) at exactly 5 rounds', () => {
    const payload = computeOverallPayload({
      rounds: buildFiveRounds(),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'first-five-card1-seed',
      variantOffset: 0,
      mode: 'combined',
    });

    expect(cards[0]).toContain('Scoring trend:');
    expect(cards[0]).toContain('Latest round');
    expect(cards[0].toLowerCase()).not.toContain('not available');
    expect(cards[0].toLowerCase()).not.toContain('no combined rounds');
  });

  it('uses a 5-round consistency window (4 rounds insufficient, 5 rounds evaluated)', () => {
    const fourRoundsPayload = computeOverallPayload({
      rounds: Array.from({ length: 4 }, (_, i) => mkRound(i)),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });
    expect(fourRoundsPayload.consistency.label).toBe('insufficient');
    expect(fourRoundsPayload.consistency.stdDev).toBeNull();

    const fiveRoundsPayload = computeOverallPayload({
      rounds: buildFiveRounds(),
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });
    expect(fiveRoundsPayload.consistency.label).toBe('stable');
    expect(fiveRoundsPayload.consistency.stdDev).toBe(0);
  });

  it('keeps trajectory flat for <=5 rounds and keeps premium score projection locked until 10 rounds', () => {
    const rounds = Array.from({ length: 5 }, (_, i) =>
      mkRound(i, {
        score: 80 - i, // intentionally trending to prove early-sample guard wins
        toPar: 8 - i,
      }),
    );
    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.projection.trajectory).toBe('flat');
    expect(payload.projection.projectedScoreIn10).toBeNull();
    expect(payload.projection.projectedHandicapIn10).toBeNull();
    expect(payload.projection_ranges).toBeUndefined();
    expect(payload.projection_by_mode.combined.trajectory).toBe('flat');
    expect(payload.projection_by_mode.combined.projectedScoreIn10).toBeNull();
    expect(payload.projection_by_mode.combined.roundsUsed).toBe(5);
  });

  it('uses the free-tier baseline window correctly when total rounds are <=5', () => {
    const rounds = buildFiveRounds();
    const payload = computeOverallPayload({
      rounds,
      isPremium: false,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.analysis.window_baseline).toBe('last20');
    expect(payload.tier_context.baseline).toBe('last20');
    expect(payload.analysis.rounds_recent).toBe(5);
    expect(payload.analysis.rounds_baseline).toBe(5);
    expect(payload.efficiency.fir.recent).toBeCloseTo(payload.efficiency.fir.baseline!, 6);
    expect(payload.efficiency.gir.recent).toBeCloseTo(payload.efficiency.gir.baseline!, 6);
    expect(payload.efficiency.puttsTotal.recent).toBeCloseTo(payload.efficiency.puttsTotal.baseline!, 6);
    expect(payload.efficiency.penaltiesPerRound.recent).toBeCloseTo(payload.efficiency.penaltiesPerRound.baseline!, 6);
  });
});

