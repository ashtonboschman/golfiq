import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

function countPeriods(text: string): number {
  return (text.match(/\./g) ?? []).length;
}

const BASE: PostRoundPolicyInput = {
  score: 75,
  toPar: 3,
  avgScore: 74,
  band: 'expected',
  measuredComponents: [
    { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
    { name: 'approach', label: 'Approach', value: -1.2 },
    { name: 'putting', label: 'Putting', value: -0.4 },
  ],
  bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
  worstMeasured: { name: 'approach', label: 'Approach', value: -1.2 },
  opportunityIsWeak: true,
  residualDominant: false,
  weakSeparation: false,
  missing: { fir: false, gir: false, putts: false, penalties: false },
};

describe('post-round message 3 rules', () => {
  test('message 3 has one action sentence and optional tracking sentence only', () => {
    const missing0 = buildDeterministicPostRoundInsights(BASE, { fixedVariantIndex: 0 });
    expect(missing0.messages[2].startsWith('Next round focus:')).toBe(true);
    expect(countPeriods(missing0.messages[2])).toBe(1);

    const missing1 = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: false, gir: false, putts: false, penalties: true },
      },
      { fixedVariantIndex: 0 },
    );
    expect(missing1.messages[2].startsWith('Next round focus:')).toBe(true);
    expect(countPeriods(missing1.messages[2])).toBe(2);

    const missing2 = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: true, gir: false, putts: true, penalties: false },
      },
      { fixedVariantIndex: 0 },
    );
    expect(missing2.messages[2].startsWith('Next round focus:')).toBe(true);
    expect(countPeriods(missing2.messages[2])).toBe(2);
  });

  test('broad focus branch triggers when no meaningful leak is available', () => {
    const noWorst = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        measuredComponents: [],
        bestMeasured: null,
        worstMeasured: null,
        opportunityIsWeak: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(noWorst.outcomes[2]).toBe('M3-E');

    const weakFalse = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        opportunityIsWeak: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(weakFalse.outcomes[2]).toBe('M3-E');

    const weakSeparation = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        worstMeasured: { name: 'approach', label: 'Approach', value: -0.8 },
        opportunityIsWeak: true,
        weakSeparation: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(weakSeparation.outcomes[2]).toBe('M3-E');

    const weakSeparationStrongLeak = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        worstMeasured: { name: 'approach', label: 'Approach', value: -1.2 },
        opportunityIsWeak: true,
        weakSeparation: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(weakSeparationStrongLeak.outcomes[2]).toBe('M3-C');

    const meaningful = buildDeterministicPostRoundInsights(BASE, { fixedVariantIndex: 0 });
    expect(meaningful.outcomes[2]).toBe('M3-C');
  });

  test('residual sentence triggers for abs>=1.5 and residualDominant=true', () => {
    const absTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.6,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(absTrigger.messages[1]).toContain('Residual was +1.6 strokes');

    const dominantTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.2,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(dominantTrigger.messages[1]).toContain('Residual was +1.2 strokes');

    const noTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.2,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(noTrigger.messages[1]).not.toContain('Residual was');

    const nullResidual = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: null,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(nullResidual.messages[1]).not.toContain('Residual was');
    expect(nullResidual.messages[1].toLowerCase()).not.toContain('short game');
  });
});
