import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';
import { getMissingStats, getMissingCount } from '@/lib/insights/postRound/missingStats';
import { runMeasuredSgSelection } from '@/lib/insights/postRound/sgSelection';

type StatPresence = {
  fir: boolean;
  gir: boolean;
  putts: boolean;
  penalties: boolean;
};

function combo(index: number): StatPresence {
  return {
    fir: Boolean(index & 0b1000),
    gir: Boolean(index & 0b0100),
    putts: Boolean(index & 0b0010),
    penalties: Boolean(index & 0b0001),
  };
}

function buildInputForCombo(index: number): PostRoundPolicyInput {
  const present = combo(index);
  const missing = getMissingStats({
    firHit: present.fir ? 8 : null,
    girHit: present.gir ? 9 : null,
    putts: present.putts ? 32 : null,
    penalties: present.penalties ? 1 : null,
  });

  const measured = runMeasuredSgSelection(
    {
      offTee: present.fir ? -0.2 : null,
      approach: present.gir ? -0.6 : null,
      putting: present.putts ? -1.1 : null,
      penalties: present.penalties ? -0.4 : null,
      residual: -1.4,
      total: -2.3,
    },
    -1.0,
  );

  return {
    score: 75,
    toPar: 3,
    avgScore: 74,
    band: 'expected',
    measuredComponents: measured.components,
    bestMeasured: measured.best,
    worstMeasured: measured.opportunity,
    opportunityIsWeak: measured.opportunityIsWeak,
    residualDominant: false,
    weakSeparation: measured.weakSeparation,
    missing,
    residualValue: -1.4,
  };
}

function expectedM2Outcome(input: PostRoundPolicyInput): string {
  const worst = input.worstMeasured;
  if (!worst || input.measuredComponents.length < 2) return 'M2-A';
  if (Math.abs(worst.value) <= 0.3) return 'M2-C';
  if (worst.value < 0) return 'M2-D';
  if (worst.value > 0) return 'M2-E';
  return 'M2-C';
}

function expectedM3Outcome(input: PostRoundPolicyInput): string {
  const missingCount = getMissingCount(input.missing);
  if (missingCount >= 2) return 'M3-A';
  if (missingCount === 1) return 'M3-B';
  const strongMeasuredLeak = Boolean(input.worstMeasured && input.worstMeasured.value <= -1.0);
  if (!input.worstMeasured || !input.opportunityIsWeak || (input.weakSeparation && !strongMeasuredLeak)) {
    return 'M3-E';
  }
  return 'M3-C';
}

describe('deterministic policy matrix coverage', () => {
  test.each(Array.from({ length: 16 }, (_, i) => i))('covers SG observability combo %s', (index) => {
    const input = buildInputForCombo(index);
    const out = buildDeterministicPostRoundInsights(input);

    expect(out.outcomes[1]).toBe(expectedM2Outcome(input));
    expect(out.outcomes[2]).toBe(expectedM3Outcome(input));
    expect(out.messageLevels).toEqual(['success', 'warning', 'info']);
    expect(out.messages[0].startsWith('??')).toBe(false);
    expect(out.messages[0].startsWith('?')).toBe(false);
    expect(out.messages[0].startsWith('??')).toBe(false);
    expect(out.messages[0].startsWith('??')).toBe(false);
  });

  test('M1 threshold boundary: |best| <= 0.3 is M1-D, > 0.3 is M1-C, < -0.3 is M1-B', () => {
    const base: PostRoundPolicyInput = {
      score: 75,
      toPar: 3,
      avgScore: 74,
      band: 'expected',
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.4 },
        { name: 'approach', label: 'Approach', value: -0.4 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.4 },
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.4 },
      opportunityIsWeak: false,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: false, gir: false, putts: false, penalties: false },
    };

    const positive = buildDeterministicPostRoundInsights(base);
    expect(positive.outcomes[0]).toBe('M1-C');

    const negative = buildDeterministicPostRoundInsights({
      ...base,
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
        { name: 'approach', label: 'Approach', value: -0.4 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
    });
    expect(negative.outcomes[0]).toBe('M1-B');

    const neutral = buildDeterministicPostRoundInsights({
      ...base,
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.3 },
        { name: 'approach', label: 'Approach', value: -0.4 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.3 },
    });
    expect(neutral.outcomes[0]).toBe('M1-D');
  });

  test('M2/M3 threshold boundary: only meaningful weak opportunities stay area-specific', () => {
    const base: PostRoundPolicyInput = {
      score: 75,
      toPar: 3,
      avgScore: 74,
      band: 'expected',
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
        { name: 'approach', label: 'Approach', value: -0.5 },
      ],
      bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.5 },
      opportunityIsWeak: true,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: false, gir: false, putts: false, penalties: false },
    };

    const weak = buildDeterministicPostRoundInsights(base);
    expect(weak.outcomes[1]).toBe('M2-D');
    expect(weak.outcomes[2]).toBe('M3-C');

    const neutral = buildDeterministicPostRoundInsights({
      ...base,
      measuredComponents: [
        { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
        { name: 'approach', label: 'Approach', value: -0.49 },
      ],
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.49 },
      opportunityIsWeak: false,
    });
    expect(neutral.outcomes[1]).toBe('M2-D');
    expect(neutral.outcomes[2]).toBe('M3-E');
  });

  test('score context edge cases are deterministic around +/-0.1 threshold', () => {
    const equalish = buildDeterministicPostRoundInsights({
      score: 74.04,
      toPar: 2,
      avgScore: 74,
      band: 'expected',
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      opportunityIsWeak: false,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    });
    expect(equalish.messages[0]).toContain('matches your recent average');

    const above = buildDeterministicPostRoundInsights({
      score: 74.2,
      toPar: 2,
      avgScore: 74,
      band: 'expected',
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      opportunityIsWeak: false,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    });
    expect(above.messages[0]).toContain('above your recent average');

    const below = buildDeterministicPostRoundInsights({
      score: 73.8,
      toPar: 1,
      avgScore: 74,
      band: 'expected',
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      opportunityIsWeak: false,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    });
    expect(below.messages[0]).toContain('better than your recent average');
  });
});
