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

const STYLE_DISCOURAGED = [
  /\bplus territory\b/i,
  /\bin the black\b/i,
  /\bhero line\b/i,
  /\btop measured contributor\b/i,
];

const STYLE_CASES: PostRoundPolicyInput[] = [
  BASE,
  {
    ...BASE,
    measuredComponents: [{ name: 'putting', label: 'Putting', value: -1.1 }],
    bestMeasured: { name: 'putting', label: 'Putting', value: -1.1 },
    worstMeasured: { name: 'putting', label: 'Putting', value: -1.1 },
    missing: { fir: true, gir: true, putts: false, penalties: true },
  },
  {
    ...BASE,
    measuredComponents: [],
    bestMeasured: null,
    worstMeasured: null,
    missing: { fir: true, gir: true, putts: true, penalties: true },
  },
];

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+\s*/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

describe('post-round style guardrails', () => {
  it('keeps sentence lengths readable across sampled variants', () => {
    for (const input of STYLE_CASES) {
      for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
        const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: variantIndex });
        const sentences = [...splitSentences(out.messages[0]), ...splitSentences(out.messages[1]), ...splitSentences(out.messages[2])];
        for (const sentence of sentences) {
          expect(sentence.length).toBeLessThanOrEqual(170);
        }
      }
    }
  });

  it('keeps M3 tracking openers varied instead of dominated by one verb', () => {
    const openerCounts = new Map<string, number>();
    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      const out = buildDeterministicPostRoundInsights(
        {
          ...BASE,
          missing: { fir: true, gir: true, putts: false, penalties: true },
        },
        { fixedVariantIndex: variantIndex },
      );
      const withoutPrefix = out.messages[2].replace(/^Next round:\s*/, '');
      const opener = withoutPrefix.split(/\s+/)[0]?.toLowerCase() ?? '';
      openerCounts.set(opener, (openerCounts.get(opener) ?? 0) + 1);
    }

    const counts = [...openerCounts.values()];
    const maxCount = counts.length ? Math.max(...counts) : 0;
    expect(openerCounts.size).toBeGreaterThanOrEqual(2);
    expect(maxCount).toBeLessThanOrEqual(6);
  });

  it('avoids discouraged style phrases across sampled variants', () => {
    for (const input of STYLE_CASES) {
      for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
        const out = buildDeterministicPostRoundInsights(input, { fixedVariantIndex: variantIndex });
        const textToCheck = `${out.messages[0]} ${out.messages[1]} ${out.messages[2]}`;
        for (const discouraged of STYLE_DISCOURAGED) {
          expect(textToCheck).not.toMatch(discouraged);
        }
      }
    }
  });
});
