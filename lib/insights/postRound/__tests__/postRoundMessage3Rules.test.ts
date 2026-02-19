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
    expect(missing0.messages[2].startsWith('Next round:')).toBe(true);
    expect(countPeriods(missing0.messages[2])).toBe(1);
    expect(missing0.messages[2]).toMatch(/^Next round: .*[.!?]$/);

    const missing1 = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: false, gir: false, putts: false, penalties: true },
      },
      { fixedVariantIndex: 0 },
    );
    expect(missing1.messages[2].startsWith('Next round:')).toBe(true);
    expect(countPeriods(missing1.messages[2])).toBe(2);
    expect(missing1.messages[2]).toMatch(/^Next round: .*[.!?] [A-Z].*[.!?]$/);

    const missing2 = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: true, gir: false, putts: true, penalties: false },
      },
      { fixedVariantIndex: 0 },
    );
    expect(missing2.messages[2].startsWith('Next round:')).toBe(true);
    expect(countPeriods(missing2.messages[2])).toBe(2);
    expect(missing2.messages[2]).toMatch(/^Next round: .*[.!?] [A-Z].*[.!?]$/);
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
    expect(absTrigger.messages[1]).toContain('+1.6 strokes');

    const dominantTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.2,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(dominantTrigger.messages[1]).toContain('+1.2 strokes');

    const noTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.2,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(noTrigger.messages[1]).not.toContain('+1.2 strokes');

    const nullResidual = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: null,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(nullResidual.messages[1]).not.toContain('strokes of swing coming from areas that were not tracked');
    expect(nullResidual.messages[1].toLowerCase()).not.toContain('short game');
  });

  test('9-hole normalization lowers residual sentence threshold in message 2', () => {
    const fullRound = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        holesPlayed: 18,
        residualValue: 0.8,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(fullRound.messages[1]).not.toContain('Residual was');

    const nineHole = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        holesPlayed: 9,
        residualValue: 0.8,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(nineHole.messages[1]).toContain('+0.8 strokes');
  });

  test('M3-B uses broad action when one stat is missing but leak is not meaningful', () => {
    const m3bBroad = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: false, gir: false, putts: false, penalties: true },
        worstMeasured: { name: 'approach', label: 'Approach', value: -0.4 },
        opportunityIsWeak: false,
      },
      { fixedVariantIndex: 0 },
    );

    expect(m3bBroad.outcomes[2]).toBe('M3-B');
    expect(m3bBroad.messages[2]).toContain('Track penalties');
    expect(m3bBroad.messages[2]).toContain('Play to the widest target');
  });

  test('tracking-first gate stays M3-A even when measured weakness is extreme', () => {
    const trackingFirst = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: true, gir: true, putts: false, penalties: false },
        worstMeasured: { name: 'approach', label: 'Approach', value: -3.2 },
        opportunityIsWeak: true,
      },
      { fixedVariantIndex: 0 },
    );

    expect(trackingFirst.outcomes[2]).toBe('M3-A');
    expect(trackingFirst.messages[2]).toContain('Track FIR and GIR');
    expect(trackingFirst.messages[2]).toContain('Play to the widest target');
    expect(trackingFirst.messages[2]).not.toContain('Default to a center-green target');
  });

  test('M3-B area-specific action follows worstMeasured area only', () => {
    const m3bApproach = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: false, gir: false, putts: false, penalties: true },
        worstMeasured: { name: 'approach', label: 'Approach', value: -1.4 },
        opportunityIsWeak: false,
      },
      { fixedVariantIndex: 0 },
    );

    expect(m3bApproach.outcomes[2]).toBe('M3-B');
    expect(m3bApproach.messages[2]).toContain('Track penalties');
    expect(m3bApproach.messages[2]).toContain('Default to a center-green target');
    expect(m3bApproach.messages[2]).not.toContain('When penalty is in play');
  });
});
