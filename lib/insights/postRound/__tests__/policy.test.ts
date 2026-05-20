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
    expect(out.messages[1].toLowerCase()).not.toContain('recent');
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
    expect(out.messages[1]).toContain('cost about 1.6 strokes');
    expect(out.messages[1]).not.toContain('+2.2 strokes');
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
    expect(out.messages[2]).toContain('Next round:');
    expect(out.messages[2].toLowerCase()).not.toContain('track ');
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
    expect(out.messages[0]).toContain('With only Putting logged');
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

  test('uses broad positive M2 copy when all measured components are positive in a strong round', () => {
    const comps = [
      { name: 'approach' as const, label: 'Approach', value: 4.8 },
      { name: 'putting' as const, label: 'Putting', value: 3.1 },
      { name: 'penalties' as const, label: 'Penalties', value: 2.9 },
      { name: 'off_tee' as const, label: 'Off The Tee', value: 1.0 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        band: 'great',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[3],
        opportunityIsWeak: false,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-E');
    expect(out.messageLevels[1]).toBe('success');
    expect(out.messages[1]).toContain('Several areas contributed positively');
    expect(out.messages[1]).not.toContain('Off The Tee likely helped the score');
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
    expect(out.messages[1].toLowerCase()).toMatch(
      /part of the round slipped away through mistakes that added up across several holes|a few scoring leaks came from in-between situations across the round|several costly holes came from mistakes that built on each other|some strokes slipped away through connected mistakes rather than one clear area/,
    );
  });

  test('uses short-game-specific negative M2 copy when short game is the worst measured area', () => {
    const comps = [
      { name: 'approach' as const, label: 'Approach', value: -0.2 },
      { name: 'short_game' as const, label: 'Short Game', value: -1.1 },
      { name: 'putting' as const, label: 'Putting', value: -0.3 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
        roundEvidence: {
          fairwaysHit: 8,
          fairwaysPossible: 14,
          greensHit: 7,
          greensPossible: 18,
          puttsTotal: 32,
          penaltiesTotal: 1,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-D');
    expect(out.messages[1]).toContain('Short Game added pressure after missed greens');
  });

  test('uses short-game-specific positive M2 copy when short game is measured as positive', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 0.7 },
      { name: 'short_game' as const, label: 'Short Game', value: 0.4 },
      { name: 'putting' as const, label: 'Putting', value: 0.2 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: false,
        roundEvidence: {
          fairwaysHit: 10,
          fairwaysPossible: 14,
          greensHit: 11,
          greensPossible: 18,
          puttsTotal: 30,
          penaltiesTotal: 0,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-E');
    expect(out.messages[1]).toContain('Short Game protected scoring after missed greens');
  });

  test('uses penalties-safe positive copy for M2-E outside strong all-positive context', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 1.1 },
      { name: 'penalties' as const, label: 'Penalties', value: 0.4 },
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
    expect(out.messages[1]).toContain('Penalties still helped the score by about');
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

  test('LOW confidence keeps M1 score-focused and M2 broad even with measured components', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.2 },
      { name: 'approach' as const, label: 'Approach', value: -1.4 },
      { name: 'putting' as const, label: 'Putting', value: -0.7 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[0]).toBe('M1-A');
    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[0]).toMatch(/^You shot /);
    expect(out.messages[0]).not.toMatch(/Off The Tee|Approach|Putting|Penalties/);
    expect(out.messages[1].toLowerCase()).not.toContain('main source');
    expect(out.messages[1].toLowerCase()).not.toContain('biggest source');
    expect(out.messages[1].toLowerCase()).not.toContain('cost the most');
    expect(out.messages[1].toLowerCase()).not.toContain('accounted for the most');
    expect(out.messages[1].toLowerCase()).not.toContain('strokes gained');
    expect(out.messages[1]).not.toMatch(/\b\d+(\.\d)? strokes\b/i);
  });

  test('LOW confidence score-only still returns useful M2 and action-first M3', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [],
        bestMeasured: null,
        worstMeasured: null,
        missing: { fir: true, gir: true, putts: true, penalties: true },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1].length).toBeGreaterThan(20);
    expect(out.messages[2].startsWith('Next round:')).toBe(true);
  });

  test('LOW confidence prefers GIR-grounded M2 when GIR is meaningfully low', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
          { name: 'approach', label: 'Approach', value: -1.2 },
          { name: 'putting', label: 'Putting', value: -0.5 },
        ],
        bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
        worstMeasured: { name: 'approach', label: 'Approach', value: -1.2 },
        opportunityIsWeak: true,
        holesPlayed: 9,
        roundEvidence: {
          fairwaysHit: 3,
          fairwaysPossible: 7,
          greensHit: 3,
          greensPossible: 9,
          puttsTotal: 19,
          penaltiesTotal: 1,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('With 3/9 greens hit');
    expect(out.messages[1].toLowerCase()).not.toContain('main source');
    expect(out.messages[1].toLowerCase()).not.toContain('biggest source');
    expect(out.messages[1]).not.toMatch(/\b\d+(\.\d)? strokes\b/i);
  });

  test('LOW confidence uses penalty-grounded M2 when GIR is not low and penalties are present', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
          { name: 'approach', label: 'Approach', value: -1.2 },
          { name: 'putting', label: 'Putting', value: -0.5 },
        ],
        bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
        worstMeasured: { name: 'approach', label: 'Approach', value: -1.2 },
        opportunityIsWeak: true,
        holesPlayed: 18,
        roundEvidence: {
          fairwaysHit: 8,
          fairwaysPossible: 14,
          greensHit: 10,
          greensPossible: 18,
          puttsTotal: 32,
          penaltiesTotal: 1,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('With 1 penalty stroke');
  });

  test('LOW confidence extreme penalties override low-GIR grounded copy on 18 holes', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -1.4 },
          { name: 'approach', label: 'Approach', value: -1.1 },
          { name: 'putting', label: 'Putting', value: -0.6 },
          { name: 'penalties', label: 'Penalties', value: -3.2 },
        ],
        bestMeasured: { name: 'putting', label: 'Putting', value: -0.6 },
        worstMeasured: { name: 'penalties', label: 'Penalties', value: -3.2 },
        opportunityIsWeak: true,
        holesPlayed: 18,
        roundEvidence: {
          fairwaysHit: 2,
          fairwaysPossible: 12,
          greensHit: 5,
          greensPossible: 18,
          puttsTotal: 35,
          penaltiesTotal: 6,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('Penalty trouble created the biggest scoring pressure in this round.');
    expect(out.messages[1]).not.toContain('Missing that many greens usually puts pressure');
  });

  test('LOW confidence off-tee plus penalties override low-GIR grounded copy on 18 holes', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -2.1 },
          { name: 'approach', label: 'Approach', value: -1.0 },
          { name: 'putting', label: 'Putting', value: -0.4 },
          { name: 'penalties', label: 'Penalties', value: -2.5 },
        ],
        bestMeasured: { name: 'putting', label: 'Putting', value: -0.4 },
        worstMeasured: { name: 'off_tee', label: 'Off The Tee', value: -2.1 },
        opportunityIsWeak: true,
        holesPlayed: 18,
        roundEvidence: {
          fairwaysHit: 2,
          fairwaysPossible: 12,
          greensHit: 6,
          greensPossible: 18,
          puttsTotal: 34,
          penaltiesTotal: 4,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('Penalty trouble created the biggest scoring pressure in this round.');
    expect(out.messages[1]).not.toContain('Missing that many greens usually puts pressure');
  });

  test('LOW confidence normal low GIR still uses GIR-pressure copy when penalties are not extreme', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -0.7 },
          { name: 'approach', label: 'Approach', value: -1.4 },
          { name: 'putting', label: 'Putting', value: -0.5 },
        ],
        bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.7 },
        worstMeasured: { name: 'approach', label: 'Approach', value: -1.4 },
        opportunityIsWeak: true,
        holesPlayed: 18,
        roundEvidence: {
          fairwaysHit: 7,
          fairwaysPossible: 14,
          greensHit: 2,
          greensPossible: 18,
          puttsTotal: 33,
          penaltiesTotal: 1,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('With 2/18 greens hit');
    expect(out.messages[1]).not.toContain('Penalty trouble created the biggest scoring pressure in this round.');
  });

  test('LOW confidence 9-hole penalties=2 can override low-GIR grounded copy', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -1.1 },
          { name: 'approach', label: 'Approach', value: -0.8 },
          { name: 'putting', label: 'Putting', value: -0.3 },
          { name: 'penalties', label: 'Penalties', value: -1.8 },
        ],
        bestMeasured: { name: 'putting', label: 'Putting', value: -0.3 },
        worstMeasured: { name: 'penalties', label: 'Penalties', value: -1.8 },
        opportunityIsWeak: true,
        holesPlayed: 9,
        roundEvidence: {
          fairwaysHit: 1,
          fairwaysPossible: 6,
          greensHit: 2,
          greensPossible: 9,
          puttsTotal: 18,
          penaltiesTotal: 2,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('Penalty trouble created the biggest scoring pressure in this round.');
  });

  test('LOW confidence uses neutral grounded M2 when stats exist but no threshold trigger', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        measuredComponents: [
          { name: 'off_tee', label: 'Off The Tee', value: -0.3 },
          { name: 'approach', label: 'Approach', value: -0.6 },
        ],
        bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.3 },
        worstMeasured: { name: 'approach', label: 'Approach', value: -0.6 },
        opportunityIsWeak: true,
        holesPlayed: 18,
        roundEvidence: {
          fairwaysHit: 9,
          fairwaysPossible: 14,
          greensHit: 9,
          greensPossible: 18,
          puttsTotal: 31,
          penaltiesTotal: 0,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1]).toContain('With 9/18 greens hit');
    expect(out.messages[1].toLowerCase()).not.toContain('rounds like this');
  });

  test('score-only with usual-level context in M1 avoids trend duplication in M2', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        measuredComponents: [],
        bestMeasured: null,
        worstMeasured: null,
        avgScore: 74.8,
        score: 75,
        missing: { fir: true, gir: true, putts: true, penalties: true },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.messages[0].toLowerCase()).toContain('recent average');
    expect(out.messages[1].toLowerCase()).not.toContain('recent scoring baseline');
    expect(out.messages[1].toLowerCase()).not.toContain('recent usual scoring level');
    expect(out.messages[1].toLowerCase()).not.toContain('recent average');
    expect(out.messages[1].toLowerCase()).not.toContain('recent pattern');
    expect(out.messages[1].toLowerCase()).not.toContain('normal scoring range');
    expect(out.messages[1].toLowerCase()).not.toContain('typical scoring window');
    expect(out.messages[1].toLowerCase()).not.toContain('recent trend');
  });

  test('no-usual-level M1 includes setup phrase', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'LOW',
        avgScore: null,
        score: 46,
        toPar: 10,
        measuredComponents: [],
        bestMeasured: null,
        worstMeasured: null,
        missing: { fir: true, gir: true, putts: true, penalties: true },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.messages[0]).toContain('You shot 46 (+10).');
    expect(out.messages[0]).toMatch(
      /A solid starting point to build from\.|A good usual level to build from\.|This gives you a starting point for future rounds\./,
    );
  });

  test('usual-level M1 keeps recent-average comparison and does not append setup suffix', () => {
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'MED',
        avgScore: 81.8,
        score: 79,
        toPar: 9,
        measuredComponents: [],
        bestMeasured: null,
        worstMeasured: null,
        missing: { fir: true, gir: true, putts: true, penalties: true },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.messages[0]).toContain('recent average');
    expect(out.messages[0]).not.toContain('A solid starting point to build from.');
    expect(out.messages[0]).not.toContain('A good usual level to build from.');
    expect(out.messages[0]).not.toContain('This gives you a starting point for future rounds.');
  });

  test('MED and HIGH confidence produce meaningfully different M2 decisiveness', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.3 },
      { name: 'approach' as const, label: 'Approach', value: -1.3 },
      { name: 'putting' as const, label: 'Putting', value: -0.4 },
    ];

    const med = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'MED',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
      }),
      { fixedVariantIndex: 0 },
    );
    const high = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'HIGH',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(med.outcomes[1]).toBe('M2-D');
    expect(high.outcomes[1]).toBe('M2-D');
    expect(med.messages[1].toLowerCase()).toContain('likely');
    expect(high.messages[1].toLowerCase()).not.toContain('likely');
    expect(med.messages[1]).not.toBe(high.messages[1]);
  });

  test('HIGH confidence remains decisive without fake certainty mechanics claims', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.2 },
      { name: 'approach' as const, label: 'Approach', value: -1.5 },
      { name: 'putting' as const, label: 'Putting', value: -0.6 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'HIGH',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.messages[1].toLowerCase()).toMatch(/cost|source|largest|clearest/);
    expect(out.messages[1].toLowerCase()).not.toMatch(/swing|clubface|face angle|path|mechanic/);
  });

  test('measured penalties M2-D remains penalty-specific in main measured path', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.2 },
      { name: 'approach' as const, label: 'Approach', value: -0.6 },
      { name: 'putting' as const, label: 'Putting', value: -0.4 },
      { name: 'penalties' as const, label: 'Penalties', value: -1.6 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'HIGH',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[3],
        opportunityIsWeak: true,
        roundEvidence: {
          fairwaysHit: 9,
          fairwaysPossible: 14,
          greensHit: 10,
          greensPossible: 18,
          puttsTotal: 32,
          penaltiesTotal: 4,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-D');
    expect(out.messages[1]).toContain('Penalties were the biggest source of lost strokes');
  });

  test('residual-dominant ambiguous rounds acknowledge uncertainty instead of forcing one cause', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: -0.3 },
      { name: 'approach' as const, label: 'Approach', value: -0.6 },
      { name: 'putting' as const, label: 'Putting', value: -0.4 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'MED',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
        residualDominant: true,
        residualValue: 2.0,
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-D');
    expect(out.messages[1].toLowerCase()).toMatch(
      /likely contributed about|likely mattered at|was probably part of the story|round likely included both/,
    );
    expect(out.messages[1].toLowerCase()).toContain('likely');
    expect(out.messages[1].toLowerCase()).not.toContain('main source of lost strokes');
  });

  test('partial-stat MED guidance stays grounded in available evidence', () => {
    const onlyMeasured = [{ name: 'off_tee' as const, label: 'Off The Tee', value: -0.9 }];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'MED',
        measuredComponents: onlyMeasured,
        bestMeasured: onlyMeasured[0],
        worstMeasured: onlyMeasured[0],
        missing: { fir: false, gir: true, putts: true, penalties: true },
        roundEvidence: {
          fairwaysHit: 5,
          fairwaysPossible: 14,
          greensHit: null,
          greensPossible: null,
          puttsTotal: null,
          penaltiesTotal: null,
        },
      }),
      { fixedVariantIndex: 0 },
    );

    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messages[1].toLowerCase()).not.toContain('putting');
    expect(out.messages[1].toLowerCase()).not.toContain('penalties');
  });

  test('post-round copy avoids Overall and Round Focus long-term coaching language', () => {
    const comps = [
      { name: 'off_tee' as const, label: 'Off The Tee', value: 0.2 },
      { name: 'approach' as const, label: 'Approach', value: -1.1 },
      { name: 'putting' as const, label: 'Putting', value: -0.4 },
    ];
    const out = buildDeterministicPostRoundInsights(
      withOverrides({
        confidence: 'HIGH',
        measuredComponents: comps,
        bestMeasured: comps[0],
        worstMeasured: comps[1],
        opportunityIsWeak: true,
      }),
      { fixedVariantIndex: 0 },
    );

    const text = out.messages.join(' ').toLowerCase();
    expect(text).not.toContain('long-term');
    expect(text).not.toContain('persistent trend');
    expect(text).not.toContain('clearest path to lower scores');
    expect(text).not.toContain('highest-value priority');
  });
});
