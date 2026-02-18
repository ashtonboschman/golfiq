import { BANNED_TOKENS } from '@/lib/insights/postRound/copyGuard';
import { buildDeterministicPostRoundInsights, type PostRoundPolicyInput } from '@/lib/insights/postRound/policy';

const CASES: PostRoundPolicyInput[] = [
  {
    score: 75,
    toPar: 3,
    avgScore: 74.2,
    band: 'expected',
    measuredComponents: [
      { name: 'off_tee', label: 'Off The Tee', value: 0.4 },
      { name: 'approach', label: 'Approach', value: -1.3 },
      { name: 'putting', label: 'Putting', value: -0.2 },
    ],
    bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.4 },
    worstMeasured: { name: 'approach', label: 'Approach', value: -1.3 },
    opportunityIsWeak: true,
    residualDominant: false,
    weakSeparation: false,
    missing: { fir: false, gir: false, putts: false, penalties: false },
    residualValue: 1.7,
  },
  {
    score: 80,
    toPar: 8,
    avgScore: 78.5,
    band: 'below',
    measuredComponents: [{ name: 'putting', label: 'Putting', value: -1.0 }],
    bestMeasured: { name: 'putting', label: 'Putting', value: -1.0 },
    worstMeasured: { name: 'putting', label: 'Putting', value: -1.0 },
    opportunityIsWeak: true,
    residualDominant: false,
    weakSeparation: false,
    missing: { fir: true, gir: false, putts: false, penalties: true },
    residualValue: -0.8,
  },
  {
    score: 74,
    toPar: 2,
    avgScore: 74,
    band: 'expected',
    measuredComponents: [
      { name: 'off_tee', label: 'Off The Tee', value: 0.1 },
      { name: 'approach', label: 'Approach', value: -0.4 },
    ],
    bestMeasured: { name: 'off_tee', label: 'Off The Tee', value: 0.1 },
    worstMeasured: { name: 'approach', label: 'Approach', value: -0.4 },
    opportunityIsWeak: false,
    residualDominant: true,
    weakSeparation: true,
    missing: { fir: false, gir: false, putts: false, penalties: false },
    residualValue: 1.1,
  },
];

describe('post-round copy smoke checks', () => {
  test.each(CASES)('copy stays clean and guarded', (input) => {
    const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: 0 });
    const full = out.messages.join(' ');
    const lower = full.toLowerCase();

    for (const token of BANNED_TOKENS) {
      expect(lower.includes(token.toLowerCase())).toBe(false);
    }

    expect(full.includes('  ')).toBe(false);
    expect(full.includes(' .')).toBe(false);
    expect(full.includes('..')).toBe(false);

    expect(out.messages[2].startsWith('Next round:')).toBe(true);
    const prefixMatches = out.messages[2].match(/Next round:/g) ?? [];
    expect(prefixMatches.length).toBe(1);
  });
});
