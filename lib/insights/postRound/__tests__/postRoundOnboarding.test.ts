import { buildDeterministicPostRoundInsights } from '@/lib/insights/postRound/policy';
import { buildOnboardingPostRoundInsights } from '@/lib/insights/postRound/onboardingPolicy';

describe('buildOnboardingPostRoundInsights', () => {
  test('round 1 returns OB-1 onboarding structure', () => {
    const out = buildOnboardingPostRoundInsights({
      roundNumber: 1,
      score: 92,
      toPar: 20,
      previousScore: null,
    });

    expect(out.outcomes).toEqual(['OB-1', 'OB-1', 'OB-1']);
    expect(out.messages[0]).toContain('You shot 92 (+20)');
    expect(out.messages[1]).toContain('Two more rounds');
    expect(out.messages[2]).toContain('Next round:');
    expect(out.messages[2].toLowerCase()).toContain('track fairways, greens, putts, and penalties');
  });

  test('round 2 maps to better/same/worse outcomes from previous score', () => {
    const better = buildOnboardingPostRoundInsights({
      roundNumber: 2,
      score: 84,
      toPar: 12,
      previousScore: 88,
    });
    const same = buildOnboardingPostRoundInsights({
      roundNumber: 2,
      score: 88,
      toPar: 16,
      previousScore: 88,
    });
    const worse = buildOnboardingPostRoundInsights({
      roundNumber: 2,
      score: 92,
      toPar: 20,
      previousScore: 88,
    });

    expect(better.outcomes).toEqual(['OB-2-BETTER', 'OB-2-BETTER', 'OB-2-BETTER']);
    expect(same.outcomes).toEqual(['OB-2-SAME', 'OB-2-SAME', 'OB-2-SAME']);
    expect(worse.outcomes).toEqual(['OB-2-WORSE', 'OB-2-WORSE', 'OB-2-WORSE']);
  });

  test('round 3 maps to better/same/worse outcomes and includes unlock message', () => {
    const better = buildOnboardingPostRoundInsights({
      roundNumber: 3,
      score: 80,
      toPar: 8,
      previousScore: 84,
    });
    const same = buildOnboardingPostRoundInsights({
      roundNumber: 3,
      score: 84,
      toPar: 12,
      previousScore: 84,
    });
    const worse = buildOnboardingPostRoundInsights({
      roundNumber: 3,
      score: 87,
      toPar: 15,
      previousScore: 84,
    });

    expect(better.outcomes).toEqual(['OB-3-BETTER', 'OB-3-BETTER', 'OB-3-BETTER']);
    expect(same.outcomes).toEqual(['OB-3-SAME', 'OB-3-SAME', 'OB-3-SAME']);
    expect(worse.outcomes).toEqual(['OB-3-WORSE', 'OB-3-WORSE', 'OB-3-WORSE']);

    for (const output of [better, same, worse]) {
      expect(output.messages[2].toLowerCase()).toContain('full post-round insights start');
    }
  });

  test('round 4 and above are unsupported by onboarding builder', () => {
    expect(() =>
      buildOnboardingPostRoundInsights({
        roundNumber: 4,
        score: 78,
        toPar: 6,
        previousScore: 81,
      }),
    ).toThrow('Unsupported onboarding round number');
  });

  test('round 4+ deterministic builder uses standard M* outcomes, not OB outcomes', () => {
    const deterministic = buildDeterministicPostRoundInsights({
      score: 78,
      toPar: 6,
      avgScore: 79.5,
      band: 'expected',
      measuredComponents: [],
      bestMeasured: null,
      worstMeasured: null,
      opportunityIsWeak: false,
      residualDominant: false,
      weakSeparation: false,
      missing: { fir: true, gir: true, putts: true, penalties: true },
      residualValue: null,
    });

    expect(deterministic.outcomes.every((outcome) => !outcome.startsWith('OB-'))).toBe(true);
  });
});
