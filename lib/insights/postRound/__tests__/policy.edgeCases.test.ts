import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

const BASE: PostRoundPolicyInput = {
  score: 76,
  toPar: 4,
  avgScore: 75.6,
  band: 'expected',
  measuredComponents: [
    { name: 'off_tee', label: 'Off The Tee', value: -0.5 },
    { name: 'approach', label: 'Approach', value: -1.2 },
    { name: 'putting', label: 'Putting', value: -0.1 },
  ],
  bestMeasured: { name: 'putting', label: 'Putting', value: -0.1 },
  worstMeasured: { name: 'approach', label: 'Approach', value: -1.2 },
  opportunityIsWeak: true,
  residualDominant: false,
  weakSeparation: false,
  missing: { fir: false, gir: false, putts: false, penalties: true },
  holesPlayed: 18,
  roundEvidence: {
    fairwaysHit: 8,
    fairwaysPossible: 14,
    greensHit: 9,
    greensPossible: 18,
    puttsTotal: 33,
    penaltiesTotal: 1,
  },
};

describe('post-round policy edge coverage', () => {
  test.each([
    ['tough', 'success'],
    ['below', 'success'],
    ['expected', 'success'],
    ['above', 'great'],
    ['great', 'great'],
    ['unknown', 'success'],
  ] as const)('M1 level mapping for band=%s', (band, expectedLevel) => {
    const out = buildDeterministicPostRoundInsights({ ...BASE, band });
    expect(out.messageLevels[0]).toBe(expectedLevel);
  });

  test.each(['tough', 'unknown'] as const)('band=%s returns valid message tuple', (band) => {
    const out = buildDeterministicPostRoundInsights({ ...BASE, band });
    expect(out.messages).toHaveLength(3);
    expect(out.messageLevels).toHaveLength(3);
    expect(out.outcomes).toHaveLength(3);
  });

  test('score-only M2 worse bucket is warning', () => {
    const out = buildDeterministicPostRoundInsights({
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      avgScore: 75.6,
      score: 77.2,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    }, { fixedVariantIndex: 0 });
    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messageLevels[1]).toBe('warning');
    expect(out.messages[1]).toContain('This finished higher than your recent average');
  });

  test('score-only M2 near bucket is success', () => {
    const out = buildDeterministicPostRoundInsights({
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      avgScore: 75.6,
      score: 75.64,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    }, { fixedVariantIndex: 0 });
    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messageLevels[1]).toBe('success');
    expect(out.messages[1]).toContain('This landed close to your recent average');
  });

  test('score-only M2 better bucket is success', () => {
    const out = buildDeterministicPostRoundInsights({
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      avgScore: 75.6,
      score: 73.8,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    }, { fixedVariantIndex: 0 });
    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messageLevels[1]).toBe('success');
    expect(out.messages[1]).toContain('That is a strong score for you');
  });

  test('score-only M2 uses near bucket when avg is unavailable', () => {
    const out = buildDeterministicPostRoundInsights({
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      avgScore: null,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    }, { fixedVariantIndex: 0 });
    expect(out.outcomes[1]).toBe('M2-A');
    expect(out.messageLevels[1]).toBe('success');
    expect(out.messages[1]).toContain('This landed close to your recent average');
  });

  test('score-only M2 near/worse boundary scales for 9 holes', () => {
    const nearNine = buildDeterministicPostRoundInsights({
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      holesPlayed: 9,
      avgScore: 37.6,
      score: 38.3, // +0.7 => near bucket at 9-hole threshold (+/-0.75)
      missing: { fir: true, gir: true, putts: true, penalties: true },
    }, { fixedVariantIndex: 0 });
    expect(nearNine.messageLevels[1]).toBe('success');
    expect(nearNine.messages[1]).toContain('This landed close to your recent average');

    const worseNine = buildDeterministicPostRoundInsights({
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      holesPlayed: 9,
      avgScore: 37.6,
      score: 38.4, // +0.8 => worse bucket at 9-hole threshold (+/-0.75)
      missing: { fir: true, gir: true, putts: true, penalties: true },
    }, { fixedVariantIndex: 0 });
    expect(worseNine.messageLevels[1]).toBe('warning');
    expect(worseNine.messages[1]).toContain('This finished higher than your recent average');
  });

  test('M1-B variants always keep explicit strokes wording', () => {
    const input: PostRoundPolicyInput = {
      ...BASE,
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.6 },
        { name: 'approach', label: 'Approach', value: -1.1 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.6 },
      worstMeasured: { name: 'approach', label: 'Approach', value: -1.1 },
      missing: { fir: false, gir: false, putts: true, penalties: true },
      roundEvidence: {
        fairwaysHit: 7,
        fairwaysPossible: 14,
        greensHit: 8,
        greensPossible: 18,
        puttsTotal: null,
        penaltiesTotal: null,
      },
    };

    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: variantIndex });
      expect(out.outcomes[0]).toBe('M1-B');
      expect(out.messages[0]).toContain('strokes');
    }
  });
});
