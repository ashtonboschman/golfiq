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
    expect(out.messageLevels).toEqual(['success', 'warning', 'info']);
    expect(out.messages[0]).toContain('Measured SG components were not available');
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
    expect(out.messages[1]).toContain('Residual was +2.2 strokes');
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
    expect(out.messages[0]).toContain('was your strongest measured area');
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

    expect(out.messages[0]).toContain('(9 greens in regulation)');
    expect(out.messages[1]).toContain('(7 fairways)');
  });
});
