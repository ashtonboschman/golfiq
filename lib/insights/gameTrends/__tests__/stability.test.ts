import { resolveCanonicalStability } from '../stability';

function valuesForPopulationStdDev(standardDeviation: number): number[] {
  const scale = standardDeviation / Math.sqrt(0.8);
  return [-scale, -scale, 0, scale, scale];
}

describe('canonical Game Trends stability', () => {
  it('distinguishes unavailable data from a building sample', () => {
    expect(resolveCanonicalStability({ normalizedToParValues: [], mode: 'combined', hasEligibleRounds: false }))
      .toEqual({
        state: 'unavailable',
        confidence: 'building',
        evidence: { recentCount: 0, standardDeviation: null, scoreRange: null },
      });
    expect(resolveCanonicalStability({ normalizedToParValues: [1, 2, 3, 4], mode: 'combined', hasEligibleRounds: true }))
      .toEqual({
        state: 'building',
        confidence: 'building',
        evidence: { recentCount: 4, standardDeviation: null, scoreRange: 3 },
      });
  });

  it.each([
    ['combined', 3, 'variable'],
    ['combined', 5, 'volatile'],
    ['18', 3, 'variable'],
    ['18', 5, 'volatile'],
    ['9', 1.75, 'variable'],
    ['9', 3, 'volatile'],
  ] as const)('applies the %s-hole boundary at SD %s as %s', (mode, standardDeviation, state) => {
    expect(resolveCanonicalStability({
      normalizedToParValues: valuesForPopulationStdDev(standardDeviation),
      mode,
      hasEligibleRounds: true,
    }).state).toBe(state);
  });

  it('keeps values immediately below the variable boundary stable', () => {
    expect(resolveCanonicalStability({
      normalizedToParValues: valuesForPopulationStdDev(2.999),
      mode: '18',
      hasEligibleRounds: true,
    }).state).toBe('stable');
    expect(resolveCanonicalStability({
      normalizedToParValues: valuesForPopulationStdDev(1.749),
      mode: '9',
      hasEligibleRounds: true,
    }).state).toBe('stable');
  });
});
