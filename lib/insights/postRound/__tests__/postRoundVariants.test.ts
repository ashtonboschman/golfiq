import { BANNED_TOKENS } from '@/lib/insights/postRound/copyGuard';
import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

const INPUT: PostRoundPolicyInput = {
  score: 75,
  toPar: 3,
  avgScore: 74,
  band: 'expected',
  measuredComponents: [
    { name: 'off_tee', label: 'Off The Tee', value: 0.3 },
    { name: 'approach', label: 'Approach', value: -0.9 },
    { name: 'putting', label: 'Putting', value: -1.4 },
    { name: 'penalties', label: 'Penalties', value: -0.2 },
  ],
  bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.3 },
  worstMeasured: { name: 'putting', label: 'Putting', value: -1.4 },
  opportunityIsWeak: true,
  residualDominant: false,
  weakSeparation: false,
  missing: { fir: false, gir: false, putts: false, penalties: false },
  residualValue: 0.7,
};

describe('post-round deterministic variants', () => {
  test('variantOffset changes wording for the same round input', () => {
    const v0 = buildDeterministicPostRoundInsights(INPUT, {
      variantSeed: 'round-42',
      variantOffset: 0,
    });
    const v1 = buildDeterministicPostRoundInsights(INPUT, {
      variantSeed: 'round-42',
      variantOffset: 1,
    });

    expect(
      v0.messages[0] !== v1.messages[0] ||
      v0.messages[1] !== v1.messages[1] ||
      v0.messages[2] !== v1.messages[2],
    ).toBe(true);
    expect(v0.outcomes).toEqual(v1.outcomes);
  });

  test('selected variants avoid banned phrases and em dash', () => {
    for (let idx = 0; idx < 10; idx += 1) {
      const out = buildDeterministicPostRoundInsights(INPUT, {
        fixedVariantIndex: idx,
      });
      const combined = out.messages.join(' ').toLowerCase();
      for (const token of BANNED_TOKENS) {
        expect(combined.includes(token.toLowerCase())).toBe(false);
      }
    }
  });
});
