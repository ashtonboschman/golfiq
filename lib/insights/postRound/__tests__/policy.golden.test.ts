import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

type GoldenCase = {
  name: string;
  input: PostRoundPolicyInput;
  expectedOutcomes: [string, string, string];
  expectedLevels: ['great' | 'success' | 'warning' | 'info', 'great' | 'success' | 'warning' | 'info', 'great' | 'success' | 'warning' | 'info'];
  m1Includes: string[];
  m2Includes: string[];
  m3Includes: string[];
};

const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'full_stats_putting_opportunity_expected',
    input: {
      score: 75,
      toPar: 3,
      avgScore: 74,
      band: 'expected',
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
        { name: 'approach', label: 'Approach', value: -0.7 },
        { name: 'putting', label: 'Putting', value: -2.1 },
        { name: 'penalties', label: 'Penalties', value: -0.3 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
      worstMeasured: { name: 'putting', label: 'Putting', value: -2.1 },
      opportunityIsWeak: true,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: false, gir: false, putts: false, penalties: false },
    },
    expectedOutcomes: ['M1-D', 'M2-D', 'M3-C'],
    expectedLevels: ['success', 'warning', 'info'],
    m1Includes: ['You shot 75 (+3)', 'Off The Tee', '+0.2 strokes'],
    m2Includes: ['Putting', '2.1 strokes'],
    m3Includes: ['Next round:', 'lag putts'],
  },
  {
    name: 'great_round_optimization_tone',
    input: {
      score: 68,
      toPar: -4,
      avgScore: 72,
      band: 'great',
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 1.3 },
        { name: 'approach', label: 'Approach', value: 0.8 },
        { name: 'putting', label: 'Putting', value: -0.6 },
        { name: 'penalties', label: 'Penalties', value: 0.2 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 1.3 },
      worstMeasured: { name: 'putting', label: 'Putting', value: -0.6 },
      opportunityIsWeak: true,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: false, gir: false, putts: false, penalties: false },
    },
    expectedOutcomes: ['M1-C', 'M2-D', 'M3-C'],
    expectedLevels: ['great', 'warning', 'info'],
    m1Includes: ['You shot 68 (-4)', 'Off The Tee', '1.3 strokes'],
    m2Includes: ['Putting', '0.6 strokes'],
    m3Includes: ['Next round:', 'lag putts'],
  },
  {
    name: 'limited_tracking_three_missing',
    input: {
      score: 82,
      toPar: 10,
      avgScore: 79.2,
      band: 'below',
      measuredComponents: [{ name: 'putting', label: 'Putting', value: -1.4 }],
      bestMeasured: { name: 'putting', label: 'Putting', value: -1.4 },
      worstMeasured: { name: 'putting', label: 'Putting', value: -1.4 },
      opportunityIsWeak: true,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: true, gir: true, putts: false, penalties: true },
    },
    expectedOutcomes: ['M1-B', 'M2-A', 'M3-A'],
    expectedLevels: ['success', 'warning', 'info'],
    m1Includes: ['You shot 82 (+10)', 'Only Putting was tracked', '1.4 strokes'],
    m2Includes: ['Only one part of the round was tracked'],
    m3Includes: ['Next round:', 'Track FIR, GIR, and penalties', 'widest target available'],
  },
  {
    name: 'residual_dominant_ambiguous',
    input: {
      score: 74,
      toPar: 2,
      avgScore: 74.05,
      band: 'expected',
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.1 },
        { name: 'approach', label: 'Approach', value: -0.4 },
        { name: 'putting', label: 'Putting', value: -0.2 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.1 },
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.4 },
      opportunityIsWeak: false,
      residualDominant: true,
      weakSeparation: true,
      missing: { fir: false, gir: false, putts: false, penalties: false },
    },
    expectedOutcomes: ['M1-D', 'M2-D', 'M3-E'],
    expectedLevels: ['success', 'warning', 'info'],
    m1Includes: ['You shot 74 (+2)', 'Off The Tee', '+0.1 strokes'],
    m2Includes: ['Approach', '0.4 strokes'],
    m3Includes: ['Next round:', 'widest target available'],
  },
  {
    name: 'score_only_no_advanced_stats',
    input: {
      score: 90,
      toPar: 18,
      avgScore: null,
      band: 'below',
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      opportunityIsWeak: false,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    },
    expectedOutcomes: ['M1-A', 'M2-A', 'M3-A'],
    expectedLevels: ['success', 'success', 'info'],
    m1Includes: ['You shot 90 (+18).'],
    m2Includes: ['score only'],
    m3Includes: ['Next round:', 'Track FIR, GIR, putts, and penalties'],
  },
];

describe('post-round deterministic policy golden scenarios', () => {
  test.each(GOLDEN_CASES)('$name', ({ input, expectedOutcomes, expectedLevels, m1Includes, m2Includes, m3Includes }) => {
    const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: 0 });
    expect(out.outcomes).toEqual(expectedOutcomes);
    expect(out.messageLevels).toEqual(expectedLevels);

    for (const fragment of m1Includes) {
      expect(out.messages[0]).toContain(fragment);
    }
    for (const fragment of m2Includes) {
      expect(out.messages[1]).toContain(fragment);
    }
    for (const fragment of m3Includes) {
      expect(out.messages[2]).toContain(fragment);
    }
  });
});
