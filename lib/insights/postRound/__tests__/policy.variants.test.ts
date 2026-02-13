import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

const INPUT: PostRoundPolicyInput = {
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

describe('post-round deterministic variant behavior', () => {
  it('changes wording across offsets while outcomes stay stable', () => {
    const base = buildDeterministicPostRoundInsights(INPUT, {
      variantSeed: 'round-123',
      variantOffset: 0,
    });
    const rotated = buildDeterministicPostRoundInsights(INPUT, {
      variantSeed: 'round-123',
      variantOffset: 1,
    });

    expect(rotated.outcomes).toEqual(base.outcomes);
    expect(rotated.messageLevels).toEqual(base.messageLevels);
    expect(
      rotated.messages[0] !== base.messages[0] ||
      rotated.messages[1] !== base.messages[1] ||
      rotated.messages[2] !== base.messages[2],
    ).toBe(true);
  });

  it('is deterministic for same seed + offset', () => {
    const one = buildDeterministicPostRoundInsights(INPUT, {
      variantSeed: 'round-123',
      variantOffset: 2,
    });
    const two = buildDeterministicPostRoundInsights(INPUT, {
      variantSeed: 'round-123',
      variantOffset: 2,
    });

    expect(two).toEqual(one);
  });

  it('supports fixed variant index for testing while keeping outcomes stable', () => {
    const v0 = buildDeterministicPostRoundInsights(INPUT, {
      fixedVariantIndex: 0,
    });
    const v3 = buildDeterministicPostRoundInsights(INPUT, {
      fixedVariantIndex: 3,
    });

    expect(v3.outcomes).toEqual(v0.outcomes);
    expect(v3.messageLevels).toEqual(v0.messageLevels);
    expect(
      v3.messages[0] !== v0.messages[0] ||
      v3.messages[1] !== v0.messages[1] ||
      v3.messages[2] !== v0.messages[2],
    ).toBe(true);
  });
});
