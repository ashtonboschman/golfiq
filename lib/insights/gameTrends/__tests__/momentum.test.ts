import { resolveScoringMomentum } from '../momentum';

function scores(recent: number, previous: number): number[] {
  return [...Array(5).fill(recent), ...Array(5).fill(previous)];
}

describe('canonical scoring momentum', () => {
  it('does not resolve before two non-overlapping five-round windows exist', () => {
    expect(resolveScoringMomentum(Array(9).fill(80), '18')).toMatchObject({
      state: 'unavailable',
      recentCount: 5,
      comparisonCount: 4,
    });
  });

  it.each([
    ['18', 80, 81.5, 'improving'],
    ['18', 81.5, 80, 'worsening'],
    ['18', 81.4, 80, 'steady'],
    ['9', 40, 40.75, 'improving'],
    ['9', 40.75, 40, 'worsening'],
    ['9', 40.7, 40, 'steady'],
  ] as const)(
    'uses the exact %s-hole momentum boundary',
    (mode, recent, previous, state) => {
      expect(resolveScoringMomentum(scores(recent, previous), mode).state).toBe(state);
    },
  );
});
