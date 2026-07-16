import type { DashboardRoundFocusDto } from '@/lib/insights/dashboardRoundFocus/types';
import { composeDashboardRoundFocus } from '@/lib/insights/dashboardRoundFocus/presentation';
import {
  buildDeterministicOverallCards,
  computeOverallPayload,
  type OverallRoundPoint,
} from '@/lib/insights/overall';
import {
  buildDeterministicPostRoundInsights,
  type PostRoundPolicyInput,
} from '@/lib/insights/postRound/policy';

function makeRoundFocus(): DashboardRoundFocusDto {
  return {
    version: 'dashboard_round_focus_v2',
    tier: 'premium',
    source: 'trend',
    relationship: 'trend_only',
    selectedCategory: 'approach',
    confidence: 'strong',
    trendState: 'component',
    baselineDirection: 'worse',
    latestRoundCategory: null,
    latestRoundPolarity: null,
    sourceRoundId: null,
    trendReason: 'negative_declining',
    latestRoundUnavailableReason: 'missing_identity',
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
    const focus = composeDashboardRoundFocus(makeRoundFocus());
    const text = [focus.headline, focus.supportingText, focus.nextRoundAction].join(' ').toLowerCase();
    expect(text).toContain('clearest scoring focus');
    expect(text).toContain('largest margin for error');
    expect(text).not.toContain('season trajectory');
    expect(text).not.toContain('long-term trend');
    expect(text).not.toContain('overall pattern');
    expect(text).not.toContain('you shot');
  });

  it('representative outputs remain role-distinct without direct phrase collisions', () => {
    const focus = composeDashboardRoundFocus(makeRoundFocus());
    const overall = buildOverallCards();
    const post = buildPostRoundOutput();

    const focusHeadline = focus.headline.toLowerCase();
    const overallJoined = overall.join(' ').toLowerCase();
    const postJoined = post.messages.join(' ').toLowerCase();

    expect(overallJoined).not.toContain(focusHeadline);
    expect(postJoined).not.toContain(focusHeadline);
  });
});
