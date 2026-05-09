import { pickDirectionalPattern, summarizeDirectionalPattern } from '@/lib/insights/directionalMiss';

describe('directional miss summarization', () => {
  it('returns null for tiny samples', () => {
    const summary = summarizeDirectionalPattern({
      area: 'gir',
      values: ['miss_right', 'miss_right', null, 'hit'],
      options: { minMisses: 4 },
    });

    expect(summary).toBeNull();
  });

  it('returns null when misses are mixed/noisy', () => {
    const summary = summarizeDirectionalPattern({
      area: 'fir',
      values: ['miss_left', 'miss_left', 'miss_right', 'miss_right', 'miss_short', 'miss_long'],
      options: { minMisses: 4, minDominanceRatio: 0.65, minMargin: 2 },
    });

    expect(summary).toBeNull();
  });

  it('returns a usable dominant direction when skew is strong', () => {
    const summary = summarizeDirectionalPattern({
      area: 'gir',
      values: ['miss_short', 'miss_short', 'miss_short', 'miss_short', 'miss_short', 'miss_right'],
      options: { minMisses: 4, minDominanceRatio: 0.65, minMargin: 2 },
    });

    expect(summary).toMatchObject({
      area: 'gir',
      dominantDirection: 'short',
      count: 5,
      totalDirectionalMisses: 6,
      usable: true,
    });
    expect(summary?.confidence).toBe('medium');
  });

  it('prefers requested area when both are usable and close', () => {
    const picked = pickDirectionalPattern({
      firValues: ['miss_right', 'miss_right', 'miss_right', 'miss_right', 'miss_left'],
      girValues: ['miss_short', 'miss_short', 'miss_short', 'miss_short', 'miss_long'],
      preferredArea: 'gir',
      options: { minMisses: 4, minDominanceRatio: 0.65, minMargin: 2 },
    });

    expect(picked?.area).toBe('gir');
    expect(picked?.dominantDirection).toBe('short');
  });
});
