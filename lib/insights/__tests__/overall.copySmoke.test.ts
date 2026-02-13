import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  pickDeterministicDrillSeeded,
  type OverallInsightsPayload,
  type OverallRoundPoint,
  type SGComponentName,
} from '../overall';

const CARD_PREFIXES = [
  'Scoring trend:',
  'Strength:',
  'Opportunity:',
  'Priority first:',
  'On-course strategy:',
  'Projection:',
] as const;

const BANNED_TOKENS = ['could', 'might', 'consider', 'seems', 'challenge', '—', '–', '&mdash;'] as const;

function mkRound(partial: Partial<OverallRoundPoint>): OverallRoundPoint {
  return {
    id: BigInt(1),
    date: new Date('2026-02-01T12:00:00Z'),
    holes: 18,
    nonPar3Holes: 14,
    score: 78,
    toPar: 6,
    firHit: 8,
    girHit: 9,
    putts: 33,
    penalties: 1,
    handicapAtRound: 12.4,
    sgTotal: -0.2,
    sgOffTee: 0.3,
    sgApproach: -0.4,
    sgPutting: -0.1,
    sgPenalties: 0.2,
    sgResidual: -0.5,
    sgConfidence: null,
    sgPartialAnalysis: null,
    ...partial,
  };
}

function makeRounds(): OverallRoundPoint[] {
  return Array.from({ length: 12 }, (_, index) =>
    mkRound({
      id: BigInt(index + 1),
      date: new Date(`2026-01-${String(31 - index).padStart(2, '0')}T12:00:00Z`),
      score: 77 + (index % 3),
      toPar: 5 + (index % 3),
      sgOffTee: 0.4 - index * 0.01,
      sgApproach: -0.2 - index * 0.02,
      sgPutting: -0.1 + index * 0.01,
      sgPenalties: 0.2 - index * 0.005,
      sgResidual: -0.4 + index * 0.01,
    }),
  );
}

function assertCopySafe(text: string): void {
  const normalized = String(text ?? '').toLowerCase();
  for (const token of BANNED_TOKENS) {
    expect(normalized).not.toContain(token);
  }
}

function withOverrides(
  base: OverallInsightsPayload,
  opts: {
    analysis?: Partial<OverallInsightsPayload['analysis']>;
    projection?: Partial<OverallInsightsPayload['projection']>;
  },
): OverallInsightsPayload {
  return {
    ...base,
    analysis: {
      ...base.analysis,
      ...(opts.analysis ?? {}),
    },
    projection: {
      ...base.projection,
      ...(opts.projection ?? {}),
    },
  };
}

describe('overall copy safety smoke', () => {
  const rounds = makeRounds();
  const premiumBase = computeOverallPayload({
    rounds,
    isPremium: true,
    model: 'deterministic-v1',
    cards: Array.from({ length: 6 }, () => ''),
  });
  const freeBase = computeOverallPayload({
    rounds,
    isPremium: false,
    model: 'deterministic-v1',
    cards: Array.from({ length: 6 }, () => ''),
  });

  const recommendedDrill = 'Set a start-line gate and hit 10 reps. Goal: 7 clean starts.';

  type Scenario = {
    name: string;
    payload: OverallInsightsPayload;
    missingStats: { fir: boolean; gir: boolean; putts: boolean; penalties: boolean };
    isPremium: boolean;
    focusCard: number;
    focusPattern: RegExp;
  };

  const scenarios: Scenario[] = [
    {
      name: 'card1-1A',
      payload: withOverrides(premiumBase, {
        analysis: { avg_score_recent: null, avg_score_baseline: null },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 0,
      focusPattern: /(baseline|trend line|history|tracking|signal)/i,
    },
    {
      name: 'card1-1B',
      payload: withOverrides(premiumBase, {
        analysis: { avg_score_recent: 74, avg_score_baseline: 74.1 },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 0,
      focusPattern: /(stable|steady|aligned|matching|in sync|holding)/i,
    },
    {
      name: 'card1-1C',
      payload: withOverrides(premiumBase, {
        analysis: { avg_score_recent: 73, avg_score_baseline: 74 },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 0,
      focusPattern: /(ahead|beating|outperforming|better|advantage|under baseline)/i,
    },
    {
      name: 'card1-1D',
      payload: withOverrides(premiumBase, {
        analysis: { avg_score_recent: 75, avg_score_baseline: 74 },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 0,
      focusPattern: /(above baseline|trailing|higher than baseline|scoring drop|worse)/i,
    },
    {
      name: 'card2-2A',
      payload: withOverrides(premiumBase, {
        analysis: { strength: { name: null, value: null, label: null, coverageRecent: null, lowCoverage: false } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 1,
      focusPattern: /(eligible|coverage|threshold|log more|required)/i,
    },
    {
      name: 'card2-2B',
      payload: withOverrides(premiumBase, {
        analysis: { strength: { name: 'approach', value: 0.8, label: 'Approach', coverageRecent: 5, lowCoverage: false } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 1,
      focusPattern: /(driving|separating|outperforming|edge|gains|advantage|contributor)/i,
    },
    {
      name: 'card2-2C',
      payload: withOverrides(premiumBase, {
        analysis: { strength: { name: 'off_tee', value: 0.2, label: 'Off the Tee', coverageRecent: 5, lowCoverage: false } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 1,
      focusPattern: /(ranks first|top-performing|leading|highest|holds the highest|current leader)/i,
    },
    {
      name: 'card2-2D',
      payload: withOverrides(premiumBase, {
        analysis: { strength: { name: 'putting', value: 0.2, label: 'Putting', coverageRecent: 1, lowCoverage: true } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 1,
      focusPattern: /(limited|small sample|early|current sample|at this stage)/i,
    },
    {
      name: 'card3-3A',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { name: null, value: null, label: null, isWeakness: false, coverageRecent: null, lowCoverage: false } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 2,
      focusPattern: /(eligible|coverage|threshold|log more|required)/i,
    },
    {
      name: 'card3-3B',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { name: 'putting', value: -0.8, label: 'Putting', isWeakness: true, coverageRecent: 5, lowCoverage: false } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 2,
      focusPattern: /(scoring leak|slipping|costing|drag|urgent|largest measurable drop)/i,
    },
    {
      name: 'card3-3C',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { name: 'approach', value: 0.1, label: 'Approach', isWeakness: false, coverageRecent: 5, lowCoverage: false } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 2,
      focusPattern: /(next lever|room for improvement|most available|upside|next area)/i,
    },
    {
      name: 'card3-3D',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { name: 'penalties', value: -0.4, label: 'Penalties', isWeakness: true, coverageRecent: 1, lowCoverage: true } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 2,
      focusPattern: /(limited|early weakness|small sample|currently lowest|tracking window)/i,
    },
    {
      name: 'card3-3E',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { name: 'off_tee', value: 0.1, label: 'Off the Tee', isWeakness: false, coverageRecent: 1, lowCoverage: true } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 2,
      focusPattern: /(limited|early|lowest|small sample|tracking window)/i,
    },
    {
      name: 'card4-4A',
      payload: premiumBase,
      missingStats: { fir: true, gir: true, putts: true, penalties: false },
      isPremium: true,
      focusCard: 3,
      focusPattern: /(track|log|add|record|capture)/i,
    },
    {
      name: 'card4-4B',
      payload: premiumBase,
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 3,
      focusPattern: /(Priority first:)/i,
    },
    {
      name: 'card4-4C',
      payload: premiumBase,
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 3,
      focusPattern: /(then log|and track|then record|plus)/i,
    },
    {
      name: 'card5-5A',
      payload: premiumBase,
      missingStats: { fir: true, gir: true, putts: true, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(tracking|full tracking|full inputs|missing stats)/i,
    },
    {
      name: 'card5-low-off-tee',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'off_tee' } },
      }),
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(track|log|record|include|capture|plus)/i,
    },
    {
      name: 'card5-low-approach',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'approach' } },
      }),
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(track|log|record|include|capture|plus)/i,
    },
    {
      name: 'card5-low-putting',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'putting' } },
      }),
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(track|log|record|include|capture|plus)/i,
    },
    {
      name: 'card5-low-penalties',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'penalties' } },
      }),
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(track|log|record|include|capture|plus)/i,
    },
    {
      name: 'card5-low-general',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: null } },
      }),
      missingStats: { fir: true, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(track|log|record|include|capture|plus)/i,
    },
    {
      name: 'card5-normal-off-tee',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'off_tee' } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(tee|fairway|landing area|in play)/i,
    },
    {
      name: 'card5-normal-approach',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'approach' } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(center-green|green|approach|fat side)/i,
    },
    {
      name: 'card5-normal-putting',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'putting' } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(putt|pace|three-putt|leave)/i,
    },
    {
      name: 'card5-normal-penalties',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: 'penalties' } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(penalty|hazard|risk|safe line)/i,
    },
    {
      name: 'card5-normal-general',
      payload: withOverrides(premiumBase, {
        analysis: { opportunity: { ...premiumBase.analysis.opportunity, name: null } },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 4,
      focusPattern: /(conservative|safe target|widest|simple)/i,
    },
    {
      name: 'card6-6A',
      payload: freeBase,
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: false,
      focusCard: 5,
      focusPattern: /Upgrade/i,
    },
    {
      name: 'card6-6B',
      payload: withOverrides(premiumBase, {
        projection: { projectedScoreIn10: 72, projectedHandicapIn10: 9.4 },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 5,
      focusPattern: /~10 rounds|next ~10 rounds|over ~10 rounds/i,
    },
    {
      name: 'card6-6C',
      payload: withOverrides(premiumBase, {
        projection: { projectedScoreIn10: null, projectedHandicapIn10: null },
      }),
      missingStats: { fir: false, gir: false, putts: false, penalties: false },
      isPremium: true,
      focusCard: 5,
      focusPattern: /trajectory is/i,
    },
  ];

  test.each(scenarios)('$name keeps prefixes and avoids banned tokens across offsets', (scenario) => {
    for (let offset = 0; offset < 10; offset++) {
      const cards = buildDeterministicOverallCards({
        payload: scenario.payload,
        recommendedDrill,
        missingStats: scenario.missingStats,
        isPremium: scenario.isPremium,
        variantSeedBase: `smoke|${scenario.name}`,
        variantOffset: offset,
      });

      expect(cards).toHaveLength(6);
      cards.forEach((card, index) => {
        expect(card.startsWith(CARD_PREFIXES[index])).toBe(true);
        assertCopySafe(card);
      });

    }
  });

  test('drill library stays banned-token-safe and includes completion criteria', () => {
    const buckets: Array<SGComponentName | null> = [
      'off_tee',
      'approach',
      'putting',
      'penalties',
      'short_game',
      null,
    ];

    for (const bucket of buckets) {
      for (let offset = 0; offset < 10; offset++) {
        const drill = pickDeterministicDrillSeeded(bucket, `drill-seed|${bucket ?? 'general'}`, offset);
        assertCopySafe(drill);
        expect(drill).toContain('Goal:');
      }
    }
  });
});
