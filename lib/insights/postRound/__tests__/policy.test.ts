import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

const baseInput: PostRoundPolicyInput = {
  score: 75,
  toPar: 3,
  avgScore: 74,
  band: 'expected',
  measuredComponents: [],
  bestMeasured: null,
  worstMeasured: null,
  opportunityIsWeak: false,
  residualDominant: false,
  weakSeparation: false,
  missing: { fir: false, gir: false, putts: false, penalties: false },
};

function withOverrides(overrides: Partial<PostRoundPolicyInput>): PostRoundPolicyInput {
  return {
    ...baseInput,
    ...overrides,
  };
}

describe('buildDeterministicPostRoundInsights', () => {
  test('M1-A / M2-A / M3-A', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: [],
        missing: { fir: true, gir: true, putts: true, penalties: false },
      }),
    );

    expect(out.outcomes).toEqual(['M1-A', 'M2-A', 'M3-A']);
    expect(out.messageLevels).toEqual(['success', 'success', 'info']);
    expect(out.messages[0]).toContain('You shot 75 (+3), which is 1.0 stroke above your recent average of 74.0.');
    expect(out.messages[1].toLowerCase()).toContain('score only');
    expect(out.messages[1].toLowerCase()).toContain('recent');
    expect(out.messages[1]).not.toContain('{residualSuffix}');
    expect(out.messages[1]).not.toContain('+2.2 strokes');
  });

  test('M1-B / M2-D / M3-C with residual sentence when large', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.4 },
      { name: 'approach' as const, label: 'Approach', value: -1.6 },
      { name: 'putting' as const, label: 'Putting', value: -0.8 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
        residualValue: 2.2,
      }),
    );

    expect(out.outcomes).toEqual(['M1-B', 'M2-D', 'M3-C']);
    expect(out.messages[1]).toContain('+2.2 strokes');
  });

  test('M1-C when best measured value is positive', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 1.2 },
      { name: 'approach' as const, label: 'Approach', value: -0.9 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        band: 'above',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
      }),
    );

    expect(out.outcomes[0]).toBe('M1-C');
    expect(out.messages[0]).toContain('Off The Tee');
    expect(out.messages[0]).toContain('1.2 strokes');
  });

  test('uses penalties-safe positive copy for M1-C', () => {
    const comps = [
      { name: 'penalties' as const, label: 'Penalties', value: 0.7 },
      { name: 'off_tee' as const, label: 'Off The Tee', value: 0.1 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        band: 'above',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[0]).toBe('M1-C');
    expect(out.messages[0]).toContain('Penalties stayed under control, saving 0.7 strokes');
    expect(out.messages[0]).not.toContain('top measured contributor');
  });

  test('M1-D and M2-C for exact zero values', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 0 },
      { name: 'approach' as const, label: 'Approach', value: 0 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
      }),
    );

    expect(out.outcomes[0]).toBe('M1-D');
    expect(out.outcomes[1]).toBe('M2-C');
  });

  test('M3-B for one missing stat', () => {
    const comps = [{ name: 'putting' as const, label: 'Putting', value: -1.2 }];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[0],
        opportunityIsWeak: true,
        missing: { fir: false, gir: false, putts: false, penalties: true },
      }),
    );

    expect(out.outcomes[2]).toBe('M3-B');
    expect(out.messages[2]).toContain('Track penalties');
  });

  test('single measured negative avoids comparative "best" phrasing', () => {
    const onlyMeasured = [{ name: 'putting' as const, label: 'Putting', value: -4.4 }];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        score: 75,
        toPar: 3,
        avgScore: 75.2,
        measuredComponents: onlyMeasured,
        bestMeasured: onlyMeasured[0],
        worstMeasured: onlyMeasured[0],
        roundEvidence: {
          fairwaysHit: null,
          fairwaysPossible: null,
          greensHit: null,
          greensPossible: null,
          puttsTotal: 38,
          penaltiesTotal: null,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[0]).toBe('M1-B');
    expect(out.messages[0]).toContain('Only Putting was tracked');
    expect(out.messages[0]).toContain('(38 total putts)');
    expect(out.messages[0].toLowerCase()).not.toContain('best measured');
  });

  test('M2-E sets a positive message level independent of score band', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 0.9 },
      { name: 'approach' as const, label: 'Approach', value: 0.4 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        band: 'below',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-E');
    expect(out.messageLevels[1]).toBe('success');
  });

  test('adds stat evidence to message 1 and message 2 when available', () => {
    const comps = [
      { name: 'approach' as const, label: 'Approach', value: 1.4 },
      { name: 'off_tee' as const, label: 'Off The Tee', value: -1.2 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        roundEvidence: {
          fairwaysHit: 7,
          fairwaysPossible: 14,
          greensHit: 9,
          greensPossible: 18,
          puttsTotal: 31,
          penaltiesTotal: 1,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.messages[0]).toContain('(9/18 greens in regulation)');
    expect(out.messages[1]).toContain('(7/14 fairways)');
  });

  test('forces M2-A when only one measured component exists, even if worstMeasured is incorrectly populated', () => {
    const single = [{ name: 'off_tee' as const, label: 'Off The Tee', value: 0.1 }];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        band: 'above',
        measuredComponents: single,
        bestMeasured: single[0],
        worstMeasured: single[0],
        missing: { fir: false, gir: true, putts: true, penalties: true },
        residualValue: 0.6,
        residualDominant: true,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).not.toContain('Off The Tee');
    expect(out.messages[1]).not.toContain('{residualSuffix}');
    expect(out.messages[1]).not.toContain('+0.6 strokes');
  });

  test('keeps residual sentence for component-based M2 messages', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.6 },
      { name: 'approach' as const, label: 'Approach', value: -1.2 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        residualValue: -2.0,
        residualDominant: true,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-D');
    expect(out.messages[1]).toContain('-2.0 strokes');
  });

  test('uses penalties-safe positive copy for M2-E', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 1.1 },
      { name: 'penalties' as const, label: 'Penalties', value: 0.4 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        band: 'above',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-E');
    expect(out.messages[1]).toContain('Penalties remained a net positive');
    expect(out.messages[1]).toContain('Risk control held up');
  });

  test('score-only messages avoid specific component claims', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: [],
        bestMeasured: null,
        worstMeasured: null,
        missing: { fir: true, gir: true, putts: true, penalties: true },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[0]).toBe('M1-A');
    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[0]).not.toContain('Off The Tee');
    expect(out.messages[0]).not.toContain('Approach');
    expect(out.messages[0]).not.toContain('Putting');
    expect(out.messages[0]).not.toContain('Penalties');
    expect(out.messages[1]).not.toContain('Off The Tee');
    expect(out.messages[1]).not.toContain('Approach');
    expect(out.messages[1]).not.toContain('Putting');
    expect(out.messages[1]).not.toContain('Penalties');
  });

  test('component labels in M1 and M2 align with selected best and worst components', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 0.6 },
      { name: 'approach' as const, label: 'Approach', value: -1.3 },
      { name: 'putting' as const, label: 'Putting', value: -0.1 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[0]).toBe('M1-C');
    expect(out.outcomes[1]).toBe('M2-D');
    expect(out.messages[0]).toContain('Off The Tee');
    expect(out.messages[1]).toContain('Approach');
  });
});
