import {
  classifyBalancedComponents,
  classifyVolatilitySignal,
  downgradePersistenceTierForWeakness,
  resolvePersistenceTierFromFrequency,
} from '@/lib/insights/sharedSignals';

describe('sharedSignals', () => {
  test('maps persistence tiers with consistent frequency semantics', () => {
    expect(resolvePersistenceTierFromFrequency(0, 5)).toBe('none');
    expect(resolvePersistenceTierFromFrequency(1, 5)).toBe('temporary');
    expect(resolvePersistenceTierFromFrequency(2, 5)).toBe('emerging');
    expect(resolvePersistenceTierFromFrequency(4, 5)).toBe('persistent');
    expect(resolvePersistenceTierFromFrequency(3, 3)).toBe('persistent');
  });

  test('downgrades recurring tiers when weakness is mild or recovering', () => {
    expect(
      downgradePersistenceTierForWeakness({ tier: 'persistent', currentDelta: -0.5 }),
    ).toBe('persistent');
    expect(
      downgradePersistenceTierForWeakness({ tier: 'persistent', currentDelta: -0.22 }),
    ).toBe('emerging');
    expect(
      downgradePersistenceTierForWeakness({ tier: 'emerging', currentDelta: -0.18 }),
    ).toBe('temporary');
    expect(
      downgradePersistenceTierForWeakness({ tier: 'emerging', currentDelta: 0.05 }),
    ).toBe('temporary');
  });

  test('classifies volatility severity and ceiling-floor context', () => {
    expect(
      classifyVolatilitySignal({ consistencyLabel: 'volatile', stdDev: 2.1 }).severity,
    ).toBe('strong');
    expect(
      classifyVolatilitySignal({ consistencyLabel: 'moderate', stdDev: 1.2 }).severity,
    ).toBe('moderate');
    expect(
      classifyVolatilitySignal({ consistencyLabel: 'stable', stdDev: 1.3 }).severity,
    ).toBe('insufficient');

    const byRange = classifyVolatilitySignal({
      consistencyLabel: 'stable',
      stdDev: 1.8,
      scoreRange: 6.2,
      options: { strongScoreRange: 6, moderateScoreRange: 4 },
    });
    expect(byRange.severity).toBe('strong');
    expect(byRange.hasCeilingFloorGap).toBe(true);
  });

  test('detects balanced states from neutral bands and near-ties', () => {
    expect(
      classifyBalancedComponents({
        deltas: [-0.1, -0.08, 0.03, 0.05],
      }),
    ).toEqual({ isBalanced: true, reason: 'neutral_band' });

    expect(
      classifyBalancedComponents({
        deltas: [-0.28, -0.26, -0.05, 0.01],
      }),
    ).toEqual({ isBalanced: true, reason: 'opportunity_tie' });

    expect(
      classifyBalancedComponents({
        deltas: [-0.42, -0.19, 0.12, 0.08],
      }),
    ).toEqual({ isBalanced: false, reason: 'none' });
  });
});
