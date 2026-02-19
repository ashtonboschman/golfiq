import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

const BASE: PostRoundPolicyInput = {
  score: 75,
  toPar: 3,
  avgScore: 74,
  band: 'expected',
  measuredComponents: [
    { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
    { name: 'approach', label: 'Approach', value: -0.8 },
    { name: 'putting', label: 'Putting', value: -2.1 },
    { name: 'penalties', label: 'Penalties', value: -0.2 },
  ],
  bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.2 },
  worstMeasured: { name: 'putting', label: 'Putting', value: -2.1 },
  opportunityIsWeak: true,
  residualDominant: false,
  weakSeparation: false,
  missing: { fir: false, gir: false, putts: false, penalties: false },
};

const QUALITY_BANNED = [
  /\bbe aggressive\b/i,
  /\bdecision-?making\b/i,
  /\btrust your swing\b/i,
  /\bmomentum\b/i,
  /\bfeel\b/i,
  /\blocked in\b/i,
  /\bdialed in\b/i,
  /\bexecute better\b/i,
  /\bstay patient\b/i,
  /\bstay positive\b/i,
  /\bmentally strong\b/i,
  /\bbelieve in your game\b/i,
  /\btrust the process\b/i,
  /\bgame plan\b/i,
  /\bnext-?level\b/i,
  /\bnon-?negotiable\b/i,
];

const COVERAGE_CASES: Array<{ name: string; input: PostRoundPolicyInput }> = [
  { name: 'full_stats', input: BASE },
  {
    name: 'single_measured',
    input: {
      ...BASE,
      measuredComponents: [{ name: 'putting', label: 'Putting', value: -1.1 }],
      bestMeasured: { name: 'putting', label: 'Putting', value: -1.1 },
      worstMeasured: { name: 'putting', label: 'Putting', value: -1.1 },
      missing: { fir: true, gir: true, putts: false, penalties: true },
    },
  },
  {
    name: 'residual_dominant',
    input: {
      ...BASE,
      residualDominant: true,
      weakSeparation: true,
      worstMeasured: { name: 'approach', label: 'Approach', value: -0.3 },
    },
  },
  {
    name: 'score_only',
    input: {
      ...BASE,
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      missing: { fir: true, gir: true, putts: true, penalties: true },
    },
  },
];

describe('post-round policy message quality guardrails', () => {
  it('always prefixes Message 3 with "Next round:" for every variant', () => {
    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      const out = buildDeterministicPostRoundInsights(BASE, { fixedVariantIndex: variantIndex });
      expect(out.messages[2].startsWith('Next round:')).toBe(true);
    }
  });

  it.each(COVERAGE_CASES)('avoids vague banned phrasing across variants: $name', ({ input }) => {
    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: variantIndex });
      const textToCheck = `${out.messages[0]} ${out.messages[1]} ${out.messages[2]}`;
      for (const banned of QUALITY_BANNED) {
        expect(textToCheck).not.toMatch(banned);
      }
    }
  });

  it('avoids "today" phrasing in M3 next-round actions across variants', () => {
    const penaltiesFocus: PostRoundPolicyInput = {
      ...BASE,
      worstMeasured: { name: 'penalties', label: 'Penalties', value: -1.6 },
      opportunityIsWeak: true,
      weakSeparation: false,
      missing: { fir: false, gir: false, putts: false, penalties: false },
    };

    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      const out = buildDeterministicPostRoundInsights(penaltiesFocus, { fixedVariantIndex: variantIndex });
      expect(out.outcomes[2]).toBe('M3-C');
      expect(out.messages[2]).not.toMatch(/\btoday\b/i);
    }
  });

  it('avoids "leaks" and "damage" in M3 copy across sampled variants', () => {
    const trackingHeavy: PostRoundPolicyInput = {
      ...BASE,
      missing: { fir: true, gir: true, putts: false, penalties: true },
      measuredComponents: [{ name: 'putting', label: 'Putting', value: -1.4 }],
      bestMeasured: { name: 'putting', label: 'Putting', value: -1.4 },
      worstMeasured: { name: 'putting', label: 'Putting', value: -1.4 },
      opportunityIsWeak: true,
      weakSeparation: false,
    };

    const penaltiesFocus: PostRoundPolicyInput = {
      ...BASE,
      missing: { fir: false, gir: false, putts: false, penalties: false },
      worstMeasured: { name: 'penalties', label: 'Penalties', value: -1.6 },
      opportunityIsWeak: true,
      weakSeparation: false,
    };

    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      const withTracking = buildDeterministicPostRoundInsights(trackingHeavy, { fixedVariantIndex: variantIndex });
      const withPenalties = buildDeterministicPostRoundInsights(penaltiesFocus, { fixedVariantIndex: variantIndex });
      expect(withTracking.messages[2]).not.toMatch(/\bleaks\b/i);
      expect(withPenalties.messages[2]).not.toMatch(/\bdamage\b/i);
    }
  });
});
