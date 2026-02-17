import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  pickDeterministicDrillSeeded,
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
    sgApproach: 0.3,
    sgPutting: 0.2,
    sgPenalties: 0,
    sgResidual: -2.5,
    sgConfidence: null,
    sgPartialAnalysis: null,
    ...partial,
  };
}

describe('deterministic overall cards', () => {
  it('uses SG delta (recent vs baseline) for strength/opportunity selection', () => {
    const rounds: OverallRoundPoint[] = [];
    for (let i = 0; i < 10; i++) {
      const isRecent = i < 5;
      rounds.push(
        mkRound({
          id: BigInt(i + 1),
          date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
          sgOffTee: isRecent ? 0.8 : 0.6, // +0.2 delta
          sgApproach: isRecent ? -0.4 : 0.2, // -0.6 delta (worst)
          sgPutting: isRecent ? 0.1 : 0.2, // -0.1 delta
          sgPenalties: isRecent ? 0.0 : -0.3, // +0.3 delta (best)
        }),
      );
    }

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.analysis.strength.name).toBe('penalties');
    expect(payload.analysis.opportunity.name).toBe('approach');
  });

  it('allows strength/opportunity selection with at least 1 recent SG sample and marks low coverage', () => {
    const rounds = [
      mkRound({ id: BigInt(1), date: new Date('2026-01-31T12:00:00Z'), sgOffTee: 0.6, sgApproach: null, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(2), date: new Date('2026-01-30T12:00:00Z'), sgOffTee: 0.5, sgApproach: null, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(3), date: new Date('2026-01-29T12:00:00Z'), sgOffTee: null, sgApproach: -0.4, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(4), date: new Date('2026-01-28T12:00:00Z'), sgOffTee: null, sgApproach: -0.3, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(5), date: new Date('2026-01-27T12:00:00Z'), sgOffTee: null, sgApproach: null, sgPutting: 0.4, sgPenalties: null }),
    ];

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.analysis.strength.name).not.toBeNull();
    expect(payload.analysis.opportunity.name).not.toBeNull();
    expect(payload.analysis.strength.lowCoverage).toBe(true);
    expect(payload.analysis.opportunity.lowCoverage).toBe(true);
  });

  it('uses low-coverage copy for strength/opportunity when selected component has fewer than 3 recent samples', () => {
    const rounds = [
      mkRound({ id: BigInt(1), date: new Date('2026-01-31T12:00:00Z'), sgOffTee: 0.6, sgApproach: null, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(2), date: new Date('2026-01-30T12:00:00Z'), sgOffTee: 0.5, sgApproach: null, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(3), date: new Date('2026-01-29T12:00:00Z'), sgOffTee: null, sgApproach: -0.4, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(4), date: new Date('2026-01-28T12:00:00Z'), sgOffTee: null, sgApproach: -0.3, sgPutting: null, sgPenalties: null }),
      mkRound({ id: BigInt(5), date: new Date('2026-01-27T12:00:00Z'), sgOffTee: null, sgApproach: null, sgPutting: 0.4, sgPenalties: null }),
    ];

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: true, penalties: true },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(cards[1]).toMatch(/limited recent|small recent sample|small sample|early coverage|early signal|current sample|so far|small number|at this stage/);
    expect(cards[2]).toMatch(/limited recent|small recent sample|small sample|early coverage|early signal|current sample|so far|small number|at this stage/);
  });

  it('does not infer short_game opportunity from residual', () => {
    const rounds = [
      mkRound({ sgResidual: -4, sgOffTee: 0.7, sgApproach: 0.6, sgPutting: 0.5, sgPenalties: 0.2 }),
      mkRound({ id: BigInt(2), date: new Date('2026-01-28T12:00:00Z'), sgResidual: -3.8, sgOffTee: 0.6, sgApproach: 0.5, sgPutting: 0.4, sgPenalties: 0.1 }),
    ];

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    expect(payload.analysis.opportunity.name).not.toBe('short_game');
  });

  it('switches drill and strategy cards to tracking-first when 3+ stats are missing', () => {
    const rounds = [mkRound({ firHit: null, girHit: null })];
    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: true, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(cards[3]).toMatch(/^Priority first: (track|log|add|record|capture)/);
    expect(cards[4]).toMatch(/complete tracking|full tracking|log full stats|record missing stats|prioritize in-play outcomes and full tracking/);
  });

  it('keeps drill/strategy visible with low-coverage phrasing when 1-2 stats are missing', () => {
    const rounds = [mkRound({ firHit: null, girHit: null })];
    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(cards[3]).toContain('Priority first');
    expect(cards[3]).toContain('Use one simple pre-shot routine');
    expect(cards[3]).toMatch(/log|track|record|add/);
    expect(cards[3]).not.toContain('Priority first: track');
    expect(cards[4]).toContain('On-course strategy:');
    expect(cards[4]).toMatch(/track|log|record|include|capture|plus/);
  });

  it('keeps card 5 prefix uniform across normal, low-coverage, and track-first paths', () => {
    const rounds = [mkRound({ firHit: null, girHit: null })];
    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const normal = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });
    const lowCoverage = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });
    const trackFirst = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: true, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(normal[4].startsWith('On-course strategy:')).toBe(true);
    expect(lowCoverage[4].startsWith('On-course strategy:')).toBe(true);
    expect(trackFirst[4].startsWith('On-course strategy:')).toBe(true);
  });

  it('keeps cards 1-3 SG-based when tracking gate is active', () => {
    const rounds: OverallRoundPoint[] = [];
    for (let i = 0; i < 10; i++) {
      const isRecent = i < 5;
      rounds.push(
        mkRound({
          id: BigInt(i + 1),
          date: new Date(`2026-01-${String(31 - i).padStart(2, '0')}T12:00:00Z`),
          sgOffTee: isRecent ? 0.8 : 0.4,
          sgApproach: isRecent ? -0.8 : -0.1,
          sgPutting: isRecent ? -0.2 : -0.1,
          sgPenalties: isRecent ? 0.1 : 0.0,
          firHit: null,
          girHit: null,
          putts: 33,
          penalties: 1,
        }),
      );
    }

    const payload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: true, gir: true, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(cards[1]).toContain('Strength:');
    expect(cards[2]).toContain('Opportunity:');
    expect(cards[2]).not.toContain('provisional');
  });

  it('uses upgrade projection copy for free users', () => {
    const payload = computeOverallPayload({
      rounds: [mkRound({})],
      isPremium: false,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: false,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(cards).toHaveLength(6);
    expect(cards[5]).toContain('Projection:');
    expect(cards[5]).toContain('Upgrade');
  });

  it('uses projection target copy for premium users when projection exists', () => {
    const payload = computeOverallPayload({
      rounds: [mkRound({})],
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    payload.projection.projectedScoreIn10 = 72;
    payload.projection.projectedHandicapIn10 = 9.4;

    const cards = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    expect(cards[5]).toContain('Projection:');
    expect(cards[5]).toContain('72');
    expect(cards[5]).toContain('9.4');
  });

  it('rotates card wording when variantOffset changes for identical facts', () => {
    const payload = computeOverallPayload({
      rounds: [mkRound({})],
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const cardsOffset0 = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 0,
    });

    const cardsOffset1 = buildDeterministicOverallCards({
      payload,
      recommendedDrill: 'Use one simple pre-shot routine on every shot.',
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      variantSeedBase: 'seed',
      variantOffset: 1,
    });

    expect(cardsOffset0).not.toEqual(cardsOffset1);
  });

  it('keeps analytic facts stable while rotating presentation across variant offsets', () => {
    const rounds: OverallRoundPoint[] = Array.from({ length: 12 }, (_, index) =>
      mkRound({
        id: BigInt(index + 1),
        date: new Date(`2026-01-${String(31 - index).padStart(2, '0')}T12:00:00Z`),
        score: 77 + (index % 3),
        toPar: 5 + (index % 3),
        sgOffTee: 0.4 - index * 0.02,
        sgApproach: 0.2 - index * 0.02,
        sgPutting: 0.1 - index * 0.01,
        sgPenalties: -0.1 + index * 0.01,
        sgResidual: -0.2 + index * 0.01,
      }),
    );

    const basePayload = computeOverallPayload({
      rounds,
      isPremium: true,
      model: 'overall-deterministic-v1',
      cards: Array.from({ length: 6 }, () => ''),
    });

    const buildWithOffset = (variantOffset: number) => {
      const drillArea = basePayload.analysis.opportunity.name ?? basePayload.analysis.strength.name;
      const drill = pickDeterministicDrillSeeded(drillArea, 'user|hash|12|drill', variantOffset);
      const cards = buildDeterministicOverallCards({
        payload: basePayload,
        recommendedDrill: drill,
        missingStats: { fir: false, gir: false, putts: false, penalties: false },
        isPremium: true,
        variantSeedBase: 'user|hash|12',
        variantOffset,
      });
      const payload = computeOverallPayload({
        rounds,
        isPremium: true,
        model: 'overall-deterministic-v1',
        cards,
      });
      return { drill, cards, payload };
    };

    const v0 = buildWithOffset(0);
    const v1 = buildWithOffset(1);

    expect(v0.cards).not.toEqual(v1.cards);
    expect(v0.drill).not.toEqual(v1.drill);

    const stripPresentation = (input: ReturnType<typeof buildWithOffset>['payload']) => ({
      analysis: input.analysis,
      tier_context: input.tier_context,
      consistency: input.consistency,
      efficiency: input.efficiency,
      sg_locked: input.sg_locked,
      sg: input.sg,
      projection: input.projection,
      projection_by_mode: input.projection_by_mode,
      mode_payload: input.mode_payload,
      handicap_trend: input.handicap_trend,
      cards_locked_count: input.cards_locked_count,
      refresh: input.refresh,
    });

    expect(stripPresentation(v0.payload)).toEqual(stripPresentation(v1.payload));
  });

  it('rotates drill selection per variantOffset in the same bucket', () => {
    const seed = '123|abc|20|drill';
    const d0 = pickDeterministicDrillSeeded('approach', seed, 0);
    const d1 = pickDeterministicDrillSeeded('approach', seed, 1);
    const d2 = pickDeterministicDrillSeeded('approach', seed, 2);

    expect(d0).not.toEqual(d1);
    expect(new Set([d0, d1, d2]).size).toBeGreaterThanOrEqual(2);
  });

  it('keeps drill stable for the same seed and same variantOffset', () => {
    const seed = '123|abc|20|drill';
    const d0 = pickDeterministicDrillSeeded('approach', seed, 2);
    const d1 = pickDeterministicDrillSeeded('approach', seed, 2);
    expect(d0).toBe(d1);
  });
});

