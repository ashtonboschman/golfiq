import {
  buildRoundFocusState,
  type DashboardOverallInsightsSummary,
} from '@/lib/insights/dashboardFocus';
import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  type OverallRoundPoint,
} from '@/lib/insights/overall';
import {
  buildDeterministicPostRoundInsights,
  type PostRoundPolicyInput,
} from '@/lib/insights/postRound/policy';

function makeSummary(
  overrides: Partial<DashboardOverallInsightsSummary> = {},
): DashboardOverallInsightsSummary {
  return {
    lastUpdatedAt: '2026-03-01T12:00:00.000Z',
    drillSeed: 'seed',
    recommendationText: null,
    mode: 'combined',
    roundsRecent: 8,
    recentWindow: 5,
    scoreTrendDelta: 1.1,
    trajectoryLabel: 'Worsening',
    consistencyLabel: 'Moderate',
    consistencySpread: 3.3,
    projectionScore: 82,
    projectionScoreRange: { low: 80.7, high: 83.6 },
    projectionHandicap: 12.1,
    sgComponentDelta: {
      offTee: -0.2,
      approach: -0.9,
      putting: -0.3,
      penalties: -0.2,
      residual: 0.1,
    },
    efficiencyDelta: {
      firPctPoints: -1,
      girPctPoints: -3,
      putts: 0.2,
      penalties: 0.1,
    },
    statCoverage: {
      fir: { tracked: 5, total: 5 },
      gir: { tracked: 5, total: 5 },
      putts: { tracked: 5, total: 5 },
      penalties: { tracked: 5, total: 5 },
    },
    biggestLeakComponent: 'approach',
    confidence: 'high',
    persistenceSignal: {
      component: 'approach',
      count: 4,
      window: 5,
      tier: 'persistent',
    },
    dataQualityFlags: {
      insufficientRounds: false,
      missingScoreTrend: false,
      combinedNeedsMoreNineHoleRounds: false,
      missingComponentData: false,
      partialRecentStats: false,
      residualDominant: false,
      volatileScoring: false,
    },
    ...overrides,
  };
}

function makeRound(partial: Partial<OverallRoundPoint>): OverallRoundPoint {
  return {
    id: BigInt(1),
    date: new Date('2026-03-01T12:00:00.000Z'),
    holes: 18,
    nonPar3Holes: 14,
    score: 81,
    toPar: 9,
    firHit: 7,
    girHit: 7,
    putts: 33,
    penalties: 1,
    handicapAtRound: 12.3,
    sgTotal: -0.7,
    sgOffTee: -0.2,
    sgApproach: -1.0,
    sgPutting: -0.3,
    sgPenalties: -0.1,
    sgResidual: 0.2,
    sgConfidence: null,
    sgPartialAnalysis: null,
    firDirections: [],
    girDirections: [],
    ...partial,
  };
}

function buildOverallCards(): string[] {
  const rounds = Array.from({ length: 10 }, (_, i) =>
    makeRound({
      id: BigInt(i + 1),
      date: new Date(`2026-02-${String(28 - i).padStart(2, '0')}T12:00:00.000Z`),
      score: [82, 80, 83, 81, 79, 78, 79, 78, 77, 78][i],
      toPar: [10, 8, 11, 9, 7, 6, 7, 6, 5, 6][i],
      sgApproach: i < 5 ? -1.1 : -0.4,
    }),
  );
  const payload = computeOverallPayload({
    rounds,
    isPremium: true,
    model: 'overall-deterministic-v1',
    cards: ['', '', ''],
  });
  return buildDeterministicOverallCards({
    payload,
    recommendedDrill: 'Use one simple pre-shot routine on every shot.',
    missingStats: { fir: false, gir: false, putts: false, penalties: false },
    isPremium: true,
    mode: 'combined',
  });
}

function buildPostRoundOutput() {
  const input: PostRoundPolicyInput = {
    score: 81,
    toPar: 9,
    avgScore: 78,
    band: 'below',
    measuredComponents: [
      { name: 'off_tee', label: 'Off The Tee', value: -0.4 },
      { name: 'approach', label: 'Approach', value: -1.2 },
      { name: 'putting', label: 'Putting', value: -0.3 },
    ],
    bestMeasured: { name: 'putting', label: 'Putting', value: -0.3 },
    worstMeasured: { name: 'approach', label: 'Approach', value: -1.2 },
    opportunityIsWeak: true,
    residualDominant: false,
    weakSeparation: false,
    missing: { fir: false, gir: false, putts: false, penalties: false },
    confidence: 'HIGH',
  };
  return buildDeterministicPostRoundInsights(input, { fixedVariantIndex: 0 });
}

describe('insight system role boundaries', () => {
  it('overall insights avoid next-round priority/action phrasing', () => {
    const text = buildOverallCards().join(' ').toLowerCase();
    expect(text).not.toContain('next round');
    expect(text).not.toContain('focus on');
    expect(text).not.toContain('priority first');
  });

  it('post-round insights stay round-scoped and avoid long-term framing language', () => {
    const out = buildPostRoundOutput();
    const text = out.messages.join(' ').toLowerCase();
    expect(text).toContain('you shot');
    expect(text).toContain('next round:');
    expect(text).not.toContain('overall pattern');
    expect(text).not.toContain('season trajectory');
    expect(text).not.toContain('long-term trajectory');
  });

  it('round focus keeps immediate coaching language and avoids broad trend-report wording', () => {
    const state = buildRoundFocusState(makeSummary(), true, false);
    const text = [state.focus.headline, state.focus.body, state.focus.nextRound].join(' ').toLowerCase();
    expect(text).toContain('scoring focus');
    expect(text).not.toContain('season trajectory');
    expect(text).not.toContain('long-term trend');
    expect(text).not.toContain('overall pattern');
    expect(text).not.toContain('you shot');
  });

  it('representative outputs remain role-distinct without direct phrase collisions', () => {
    const focus = buildRoundFocusState(makeSummary(), true, false);
    const overall = buildOverallCards();
    const post = buildPostRoundOutput();

    const focusHeadline = focus.focus.headline.toLowerCase();
    const overallJoined = overall.join(' ').toLowerCase();
    const postJoined = post.messages.join(' ').toLowerCase();

    expect(overallJoined).not.toContain(focusHeadline);
    expect(postJoined).not.toContain(focusHeadline);
  });
});
