import {
  buildComponentTrendEvidence,
  isSgComponentAvailable,
  isShortGameOpportunityEligible,
  normalizeTrendValue,
  selectEligibleTrendRounds,
  type TrendEvidenceRound,
} from '../trendEvidence';

function makeRound(overrides: Partial<TrendEvidenceRound> = {}): TrendEvidenceRound {
  return {
    roundId: '1',
    date: new Date('2026-07-01T12:00:00Z'),
    createdAt: new Date('2026-07-01T13:00:00Z'),
    holes: 18,
    roundContext: 'real',
    completed: true,
    score: 80,
    toPar: 8,
    sgPartialAnalysis: false,
    shortGameOpportunityEligible: true,
    components: { off_the_tee: 0.5, approach: 0.2, short_game: 0, putting: -0.1, penalties: -0.4 },
    ...overrides,
  };
}

describe('shared trend evidence', () => {
  it('filters eligibility and orders date, createdAt and ID deterministically before applying mode and limit', () => {
    const date = new Date('2026-07-01T12:00:00Z');
    const selected = selectEligibleTrendRounds({
      rounds: [
        makeRound({ roundId: '8', date, createdAt: date, holes: 9 }),
        makeRound({ roundId: '10', date, createdAt: date }),
        makeRound({ roundId: '9', date, createdAt: date }),
        makeRound({ roundId: '11', date: new Date('2026-07-03T12:00:00Z') }),
        makeRound({ roundId: '12', roundContext: 'practice' }),
        makeRound({ roundId: '13', completed: false }),
      ],
      mode: '18',
      now: new Date('2026-07-02T12:00:00Z'),
      limit: 2,
    });
    expect(selected.map((round) => round.roundId)).toEqual(['10', '9']);
  });

  it('normalizes nine-hole values in Combined mode exactly once', () => {
    expect(normalizeTrendValue(1.2, 9, 'combined')).toBe(2.4);
    expect(normalizeTrendValue(1.2, 9, '9')).toBe(1.2);
  });

  it('uses finite component values without a round-level quality gate', () => {
    expect(isSgComponentAvailable({ value: 1 })).toBe(true);
    expect(isSgComponentAvailable({ value: 0 })).toBe(true);
    expect(isSgComponentAvailable({ value: null })).toBe(false);
    expect(isSgComponentAvailable({ value: Number.NaN })).toBe(false);
    expect(isSgComponentAvailable({ value: 1, eligible: false })).toBe(false);
  });

  it('keeps available components when another component is missing', () => {
    const evidence = buildComponentTrendEvidence([
      makeRound({ components: { off_the_tee: null, approach: 0.5, short_game: 0, putting: -0.4, penalties: -0.2 } }),
    ], '18');
    expect(evidence.off_the_tee.trackedCount).toBe(0);
    expect(evidence.approach.trackedCount).toBe(1);
    expect(evidence.putting.trackedCount).toBe(1);
  });

  it('does not award unique recurrence when highest or lowest values tie', () => {
    const evidence = buildComponentTrendEvidence([
      makeRound({ components: { off_the_tee: 0.5, approach: 0.5, short_game: 0, putting: -0.4, penalties: -0.4 } }),
    ], '18');
    expect(evidence.off_the_tee.rankedHighestCount).toBe(0);
    expect(evidence.approach.rankedHighestCount).toBe(0);
    expect(evidence.putting.rankedLowestCount).toBe(0);
    expect(evidence.penalties.rankedLowestCount).toBe(0);
  });

  it('applies the short-game opportunity guard', () => {
    expect(isShortGameOpportunityEligible(18, 14)).toBe(true);
    expect(isShortGameOpportunityEligible(18, 15)).toBe(false);
    const evidence = buildComponentTrendEvidence([makeRound({ shortGameOpportunityEligible: false })], '18');
    expect(evidence.short_game.trackedCount).toBe(0);
  });
});
