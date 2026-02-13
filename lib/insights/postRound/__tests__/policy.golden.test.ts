import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

type GoldenCase = {
  name: string;
  input: PostRoundPolicyInput;
  expected: {
    messages: [string, string, string];
    messageLevels: ['great' | 'success' | 'warning' | 'info', 'great' | 'success' | 'warning' | 'info', 'great' | 'success' | 'warning' | 'info'];
    outcomes: [string, string, string];
  };
};

const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'full_stats_putting_leak_expected',
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
    expected: {
      messages: [
        'You shot 75 (+3), which is 1.0 stroke above your recent average of 74.0. Off The Tee was your strongest measured area at +0.2 strokes.',
        'Putting was your clearest measured leak at -2.1 strokes.',
        'Next round focus: On long putts, choose a leave zone inside three feet and roll pace to that window.',
      ],
      messageLevels: ['success', 'warning', 'info'],
      outcomes: ['M1-C', 'M2-D', 'M3-C'],
    },
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
    expected: {
      messages: [
        'You shot 68 (-4), which is 4.0 strokes better than your recent average of 72.0. Off The Tee was your strongest measured area at +1.3 strokes.',
        'Putting was your clearest measured leak at -0.6 strokes.',
        'Next round focus: On long putts, choose a leave zone inside three feet and roll pace to that window.',
      ],
      messageLevels: ['great', 'success', 'info'],
      outcomes: ['M1-C', 'M2-D', 'M3-C'],
    },
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
    expected: {
      messages: [
        'You shot 82 (+10), which is 2.8 strokes above your recent average of 79.2. Putting held up best among your measured areas at -1.4 strokes.',
        'Putting was your clearest measured leak at -1.4 strokes.',
        'Next round focus: Track FIR, GIR, and penalties next round so GolfIQ can compute accurate SG components and tie recommendations to the right area. Pick conservative targets into trouble and commit to one clear shot plan on every hole.',
      ],
      messageLevels: ['success', 'warning', 'info'],
      outcomes: ['M1-B', 'M2-D', 'M3-A'],
    },
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
    expected: {
      messages: [
        'You shot 74 (+2), which matches your recent average. Off The Tee was your strongest measured area at +0.1 strokes.',
        'Approach was your clearest measured leak at -0.4 strokes.',
        'Next round focus: Pick conservative targets into trouble and commit to one clear shot plan on every hole.',
      ],
      messageLevels: ['success', 'warning', 'info'],
      outcomes: ['M1-C', 'M2-D', 'M3-E'],
    },
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
    expected: {
      messages: [
        'You shot 90 (+18). Measured SG components were not available for this round.',
        'Measured SG components were not available for a leak call.',
        'Next round focus: Track FIR, GIR, putts, and penalties next round so GolfIQ can compute accurate SG components and tie recommendations to the right area. Pick conservative targets into trouble and commit to one clear shot plan on every hole.',
      ],
      messageLevels: ['success', 'warning', 'info'],
      outcomes: ['M1-A', 'M2-A', 'M3-A'],
    },
  },
];

describe('post-round deterministic policy golden fixtures', () => {
  test.each(GOLDEN_CASES)('$name', ({ input, expected }) => {
    expect(buildDeterministicPostRoundInsights(input)).toEqual(expected);
  });
});
