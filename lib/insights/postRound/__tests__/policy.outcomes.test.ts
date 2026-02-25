import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

type OutcomeCase = {
  key: string;
  input: PostRoundPolicyInput;
  expectedOutcome: string;
  expectedMessageFragment: string;
  messageIndex: 0 | 1 | 2;
};

const baseInput: PostRoundPolicyInput = {
  score: 75,
  toPar: 3,
  avgScore: 74,
  band: 'expected',
  measuredComponents: [
    { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
    { name: 'approach', label: 'Approach', value: -0.6 },
  ],
  bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
  worstMeasured: { name: 'approach', label: 'Approach', value: -0.6 },
  opportunityIsWeak: true,
  residualDominant: false,
  weakSeparation: false,
  missing: { fir: false, gir: false, putts: false, penalties: false },
};

const cases: OutcomeCase[] = [
  {
    key: 'M1-A',
    messageIndex: 0,
    expectedOutcome: 'M1-A',
    expectedMessageFragment: 'You shot 75 (+3), which is 1.0 stroke above your recent average of 74.0.',
    input: {
      ...baseInput,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
    },
  },
  {
    key: 'M1-B',
    messageIndex: 0,
    expectedOutcome: 'M1-B',
    expectedMessageFragment: 'held up best at 0.5 strokes',
    input: {
      ...baseInput,
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.5 },
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.5 },
        { name: 'approach', label: 'Approach', value: -0.6 },
      ],
    },
  },
  {
    key: 'M1-C',
    messageIndex: 0,
    expectedOutcome: 'M1-C',
    expectedMessageFragment: 'gaining 0.5 strokes',
    input: {
      ...baseInput,
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.5 },
    },
  },
  {
    key: 'M1-D',
    messageIndex: 0,
    expectedOutcome: 'M1-D',
    expectedMessageFragment: 'finished near even at 0.0 strokes',
    input: {
      ...baseInput,
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0 },
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0 },
        { name: 'approach', label: 'Approach', value: -0.2 },
      ],
    },
  },
  {
    key: 'M2-A',
    messageIndex: 1,
    expectedOutcome: 'M2-A',
    expectedMessageFragment: 'score only',
    input: {
      ...baseInput,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
    },
  },
  {
    key: 'M2-C',
    messageIndex: 1,
    expectedOutcome: 'M2-C',
    expectedMessageFragment: 'finished near even at 0.0 strokes',
    input: {
      ...baseInput,
      worstMeasured: { name: 'approach', label: 'Approach', value: 0 },
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
        { name: 'approach', label: 'Approach', value: 0 },
      ],
    },
  },
  {
    key: 'M2-D',
    messageIndex: 1,
    expectedOutcome: 'M2-D',
    expectedMessageFragment: 'cost the most at 0.8 strokes',
    input: {
      ...baseInput,
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.8 },
    },
  },
  {
    key: 'M2-E',
    messageIndex: 1,
    expectedOutcome: 'M2-E',
    expectedMessageFragment: 'net positive at 0.4 strokes',
    input: {
      ...baseInput,
      worstMeasured: { name: 'approach', label: 'Approach', value: 0.4 },
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.9 },
        { name: 'approach', label: 'Approach', value: 0.4 },
      ],
    },
  },
  {
    key: 'M3-A',
    messageIndex: 2,
    expectedOutcome: 'M3-A',
    expectedMessageFragment: 'Track FIR, GIR, and putts',
    input: {
      ...baseInput,
      missing: { fir: true, gir: true, putts: true, penalties: false },
    },
  },
  {
    key: 'M3-B',
    messageIndex: 2,
    expectedOutcome: 'M3-B',
    expectedMessageFragment: 'Track penalties',
    input: {
      ...baseInput,
      missing: { fir: false, gir: false, putts: false, penalties: true },
    },
  },
  {
    key: 'M3-C',
    messageIndex: 2,
    expectedOutcome: 'M3-C',
    expectedMessageFragment: 'Next round:',
    input: {
      ...baseInput,
      missing: { fir: false, gir: false, putts: false, penalties: false },
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.6 },
    },
  },
  {
    key: 'M3-E',
    messageIndex: 2,
    expectedOutcome: 'M3-E',
    expectedMessageFragment: 'Next round:',
    input: {
      ...baseInput,
      missing: { fir: false, gir: false, putts: false, penalties: false },
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.49 },
      opportunityIsWeak: false,
    },
  },
];

describe('post-round deterministic policy outcome contracts', () => {
  test.each(cases)('$key', ({ input, expectedOutcome, expectedMessageFragment, messageIndex }) => {
    const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: 0 });
    expect(out.outcomes[messageIndex]).toBe(expectedOutcome);
    expect(out.messages[messageIndex]).toContain(expectedMessageFragment);
  });

  test('all documented outcomes are reachable', () => {
    const reached = new Set<string>();
    for (const item of cases) {
      const out = buildDeterministicPostRoundInsights(item.input, { fixedVariantIndex: 0 });
      reached.add(out.outcomes[0]);
      reached.add(out.outcomes[1]);
      reached.add(out.outcomes[2]);
    }

    expect(reached).toEqual(
      new Set([
        'M1-A',
        'M1-B',
        'M1-C',
        'M1-D',
        'M2-A',
        'M2-C',
        'M2-D',
        'M2-E',
        'M3-A',
        'M3-B',
        'M3-C',
        'M3-E',
      ]),
    );
  });
});
