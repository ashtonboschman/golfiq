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
  test('message 3 has one action sentence only', () => {
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
    expect(countPeriods(missing1.messages[2])).toBe(1);
    expect(missing1.messages[2]).toMatch(/^Next round: .*[.!?]$/);

    const missing2 = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: true, gir: false, putts: true, penalties: false },
      },
      { fixedVariantIndex: 0 },
    );
    expect(missing2.messages[2].startsWith('Next round:')).toBe(true);
    expect(countPeriods(missing2.messages[2])).toBe(1);
    expect(missing2.messages[2]).toMatch(/^Next round: .*[.!?]$/);
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

  test('residual sentence triggers only when residualDominant=true and above magnitude threshold', () => {
    const absTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.6,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(absTrigger.messages[1]).not.toContain('+1.6 strokes');

    const belowMagnitude = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.2,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(belowMagnitude.messages[1].toLowerCase()).not.toContain('short game');

    const dominantTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 2.0,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );
    expect(dominantTrigger.messages[1].toLowerCase()).toContain('short game');

    const noTrigger = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        residualValue: 1.2,
        residualDominant: false,
      },
      { fixedVariantIndex: 0 },
    );
    expect(noTrigger.messages[1].toLowerCase()).not.toContain('short game');

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

  test('9-hole normalization does not force residual sentence when residual is not dominant', () => {
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
    expect(nineHole.messages[1].toLowerCase()).not.toContain('short game');
  });

  test('9-hole residual suffix appears at 1.0+ when dominant', () => {
    const nineHoleDominant = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        holesPlayed: 9,
        residualValue: 1.0,
        residualDominant: true,
      },
      { fixedVariantIndex: 0 },
    );

    expect(nineHoleDominant.messages[1].toLowerCase()).toContain('short game');
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
    expect(m3bBroad.messages[2].toLowerCase()).not.toContain('track ');
    expect(m3bBroad.messages[2]).toContain('Favor approach targets that remove the short-sided miss');
  });

  test('missing-stats gate stays M3-A even when measured weakness is extreme', () => {
    const missingGateFirst = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        missing: { fir: true, gir: true, putts: false, penalties: false },
        worstMeasured: { name: 'approach', label: 'Approach', value: -3.2 },
        opportunityIsWeak: true,
      },
      { fixedVariantIndex: 0 },
    );

    expect(missingGateFirst.outcomes[2]).toBe('M3-A');
    expect(missingGateFirst.messages[2]).toContain('Favor approach targets that remove the short-sided miss');
    expect(missingGateFirst.messages[2].toLowerCase()).not.toContain('track ');
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
    expect(m3bApproach.messages[2].toLowerCase()).not.toContain('track ');
    expect(m3bApproach.messages[2]).toContain('Favor approach targets that remove the short-sided miss');
    expect(m3bApproach.messages[2]).not.toContain('When penalty is in play');
  });

  test('M3 uses penalty-heavy contextual action when penalties spike', () => {
    const penaltyHeavy = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        toPar: 11,
        roundEvidence: {
          fairwaysHit: 6,
          fairwaysPossible: 14,
          greensHit: 7,
          greensPossible: 18,
          puttsTotal: 33,
          penaltiesTotal: 3,
        },
      },
      { fixedVariantIndex: 0 },
    );

    expect(penaltyHeavy.messages[2]).toContain('Around hazards, play for the miss you can recover from');
  });

  test('M3 uses blowup-safe contextual action when score runs high without penalty spike', () => {
    const blowupHeavy = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        toPar: 12,
        roundEvidence: {
          fairwaysHit: 8,
          fairwaysPossible: 14,
          greensHit: 8,
          greensPossible: 18,
          puttsTotal: 32,
          penaltiesTotal: 0,
        },
      },
      { fixedVariantIndex: 0 },
    );

    expect(blowupHeavy.messages[2]).toContain('After mistakes, prioritize targets that keep doubles out of play');
  });

  test('M3 uses putting-heavy contextual action when putting volume is high', () => {
    const puttingHeavy = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        worstMeasured: { name: 'putting', label: 'Putting', value: -1.5 },
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
          { name: 'approach', label: 'Approach', value: -0.6 },
          { name: 'putting', label: 'Putting', value: -1.5 },
        ],
        roundEvidence: {
          fairwaysHit: 8,
          fairwaysPossible: 14,
          greensHit: 8,
          greensPossible: 18,
          puttsTotal: 36,
          penaltiesTotal: 0,
        },
      },
      { fixedVariantIndex: 0 },
    );

    expect(puttingHeavy.messages[2]).toContain('Prioritize pace that leaves stress-free second putts');
  });

  test('M3 avoids over-selling off-tee when it is least-bad but not truly good', () => {
    const offTeeLeastBad = buildDeterministicPostRoundInsights(
      {
        ...BASE,
        opportunityIsWeak: false,
        weakSeparation: true,
        worstMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.2 },
      },
      { fixedVariantIndex: 0 },
    );

    expect(offTeeLeastBad.outcomes[2]).toBe('M3-E');
    expect(offTeeLeastBad.messages[2]).toContain('Keep leaning on the tee strategy that kept misses playable');
  });
});
