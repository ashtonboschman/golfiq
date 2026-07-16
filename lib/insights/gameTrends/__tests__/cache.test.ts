import { buildCachedGameTrends, computeGameTrendsInputHash } from '../cache';
import { parseCachedGameTrends } from '../types';
import type { TrendEvidenceRound } from '@/lib/insights/trendEvidence';

const round: TrendEvidenceRound = {
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
};

describe('Game Trends V2 cache', () => {
  it('builds and parses the versioned all-mode cache', () => {
    const cache = buildCachedGameTrends([round], new Date('2026-07-02T12:00:00Z'));
    expect(parseCachedGameTrends(cache)).not.toBeNull();
    expect(cache.configVersion).toBe('game-trends-v2.2');
    expect(cache.byMode).toEqual(expect.objectContaining({ combined: expect.any(Object), '9': expect.any(Object), '18': expect.any(Object) }));
  });

  it('rejects malformed and legacy string caches', () => {
    expect(parseCachedGameTrends({ cards: ['one', 'two', 'three'] })).toBeNull();
    expect(parseCachedGameTrends({ version: 2, configVersion: 'old', inputHash: 'x', byMode: {} })).toBeNull();
    const wrongMode = buildCachedGameTrends([round], new Date('2026-07-02T12:00:00Z'));
    wrongMode.byMode['9'].mode = '18';
    expect(parseCachedGameTrends(wrongMode)).toBeNull();
  });

  it('hashes relevant evidence but ignores entitlement and copy because neither is input', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const original = computeGameTrendsInputHash([round], now);
    const changed = computeGameTrendsInputHash([{ ...round, components: { ...round.components, approach: 0.8 } }], now);
    expect(changed).not.toBe(original);
    expect(computeGameTrendsInputHash([round], now)).toBe(original);
  });

  it.each([
    ['score', { score: 81 }],
    ['score to par', { toPar: 9 }],
    ['partial analysis', { sgPartialAnalysis: true }],
    ['round date', { date: new Date('2026-06-30T12:00:00Z') }],
    ['round ordering', { createdAt: new Date('2026-07-01T14:00:00Z') }],
    ['hole normalization', { holes: 9 as const }],
    ['tee context', { hashContext: { teeContextKey: 'different-tee' } }],
  ])('invalidates when %s changes', (_label, change) => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(computeGameTrendsInputHash([{ ...round, ...change }], now))
      .not.toBe(computeGameTrendsInputHash([round], now));
  });

  it('excludes future rounds until they become eligible', () => {
    const future = { ...round, roundId: '2', date: new Date('2026-07-05T12:00:00Z') };
    expect(computeGameTrendsInputHash([round, future], new Date('2026-07-02T12:00:00Z'))).toBe(
      computeGameTrendsInputHash([round], new Date('2026-07-02T12:00:00Z')),
    );
    expect(computeGameTrendsInputHash([round, future], new Date('2026-07-06T12:00:00Z'))).not.toBe(
      computeGameTrendsInputHash([round], new Date('2026-07-06T12:00:00Z')),
    );
  });
});
