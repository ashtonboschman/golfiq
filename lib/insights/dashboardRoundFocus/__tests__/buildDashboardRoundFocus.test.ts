import { ROUND_IDENTITY_V1_VERSION, type RoundIdentity } from '@/lib/insights/roundIdentity/types';
import {
  buildDashboardRoundFocus,
  projectDashboardRoundFocus,
  type DashboardRoundFocusDependencies,
} from '../buildDashboardRoundFocus';
import type { DashboardFocusRoundCandidate, DashboardFocusRoundContext } from '../roundEnvelope';
import type { DashboardTrendMode } from '../types';

const NOW = new Date('2026-07-01T12:00:00.000Z');

function makeRound(
  id: number,
  options: {
    holes?: 9 | 18;
    context?: DashboardFocusRoundContext;
    approach?: number | null;
    putting?: number | null;
    createdAt?: string;
    date?: string;
  } = {},
): DashboardFocusRoundCandidate {
  const date = options.date ?? new Date(Date.UTC(2026, 5, id, 12)).toISOString();
  return {
    roundId: String(id),
    date,
    createdAt: options.createdAt ?? new Date(Date.UTC(2026, 5, id, 13)).toISOString(),
    playedAt: date,
    holes: options.holes ?? 18,
    roundContext: options.context ?? 'real',
    completionStatus: 'completed',
    components: {
      off_the_tee: { value: 0.2, tracked: true },
      approach: {
        value: options.approach === undefined ? -0.2 : options.approach,
        tracked: options.approach != null,
      },
      short_game: { value: 0.2, tracked: true },
      putting: {
        value: options.putting === undefined ? 0.2 : options.putting,
        tracked: options.putting != null,
      },
    },
    shortGameOpportunityEligible: true,
    sgPartialAnalysis: false,
  };
}

function makeTwentyRoundApproachTrend(context: DashboardFocusRoundContext = 'real') {
  return Array.from({ length: 20 }, (_, index) => {
    const id = index + 1;
    return makeRound(id, { context, approach: id >= 16 ? -0.6 : -0.2 });
  });
}

function makeIdentity(primaryKey: RoundIdentity['primaryKey'] = 'approach_leak'): RoundIdentity {
  return {
    version: ROUND_IDENTITY_V1_VERSION,
    inputHash: 'current-hash',
    primaryKey,
    title: 'Round identity',
    summary: 'Canonical summary.',
    shapedBy: [],
    nextRoundFocus: 'Stored fallback must not be used.',
    modifiers: [],
    evidenceLevel: 'aggregate_stats',
    confidence: 'strong',
    sampleContext: 'established',
    tone: primaryKey.endsWith('_carried') ? 'repeat' : 'fix',
    overallTone: primaryKey.endsWith('_carried') ? 'success' : 'warning',
    entryMode: 'post_round',
    statCompletenessScore: 90,
  };
}

function makeStoredInsight(identity: RoundIdentity | null) {
  if (!identity) return null;
  return {
    insights: {
      messages: ['Stored M1', 'Stored M2', 'Stored M3 must not be used'],
      raw_payload: { round_identity_v1: identity },
    },
  };
}

function makeDependencies(options: {
  rounds?: DashboardFocusRoundCandidate[];
  identity?: RoundIdentity | null;
  identityCurrent?: boolean;
  viewerPremium?: boolean;
} = {}): DashboardRoundFocusDependencies & {
  loadRoundCandidates: jest.Mock;
  loadStoredRoundInsight: jest.Mock;
  isStoredIdentityCurrent: jest.Mock;
  loadViewerPremiumEntitlement: jest.Mock;
} {
  return {
    loadRoundCandidates: jest.fn().mockResolvedValue(options.rounds ?? makeTwentyRoundApproachTrend()),
    loadStoredRoundInsight: jest.fn().mockResolvedValue(
      makeStoredInsight(options.identity === undefined ? makeIdentity() : options.identity),
    ),
    isStoredIdentityCurrent: jest.fn().mockResolvedValue(options.identityCurrent ?? true),
    loadViewerPremiumEntitlement: jest.fn().mockResolvedValue(options.viewerPremium ?? false),
  };
}

async function build(options: {
  deps?: ReturnType<typeof makeDependencies>;
  mode?: DashboardTrendMode;
  context?: DashboardFocusRoundContext;
  ownerId?: bigint;
  viewerId?: bigint;
} = {}) {
  const deps = options.deps ?? makeDependencies();
  const result = await buildDashboardRoundFocus({
    dashboardOwnerId: options.ownerId ?? BigInt(1),
    viewerId: options.viewerId ?? BigInt(1),
    mode: options.mode ?? 'combined',
    roundContext: options.context ?? 'real',
    now: NOW,
  }, deps);
  return { result, deps };
}

function containsForbiddenNumericEvidence(value: unknown): boolean {
  const forbiddenKeys = new Set([
    'recentAverage',
    'baselineAverage',
    'baselineDelta',
    'trackedRecentCount',
    'negativeRecentCount',
    'lowestComponentCount',
    'separation',
  ]);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    if (forbiddenKeys.has(key) && typeof nested === 'number') return true;
    return containsForbiddenNumericEvidence(nested);
  });
}

describe('buildDashboardRoundFocus orchestration', () => {
  it('passes distinct latest-five and prior-fifteen windows through the pipeline', async () => {
    const { result } = await build();
    expect(result.internal.envelope.recentRoundIds).toEqual(['20', '19', '18', '17', '16']);
    expect(result.internal.envelope.baselineRoundIds).toEqual(
      Array.from({ length: 15 }, (_, index) => String(15 - index)),
    );
    expect(result.internal.envelope.recentRoundIds).not.toEqual(
      expect.arrayContaining(result.internal.envelope.baselineRoundIds),
    );
  });

  it.each(['real', 'simulator', 'practice'] as const)(
    'requests and resolves only %s history',
    async (context) => {
      const deps = makeDependencies({
        rounds: [
          ...makeTwentyRoundApproachTrend(context),
          makeRound(30, { context: context === 'real' ? 'simulator' : 'real' }),
        ],
      });
      const { result } = await build({ deps, context });
      expect(deps.loadRoundCandidates).toHaveBeenCalledWith(expect.objectContaining({ roundContext: context }));
      expect(result.internal.envelope.recentRoundIds).not.toContain('30');
    },
  );

  it('allows native nine- and eighteen-hole rounds in combined mode', async () => {
    const rounds = makeTwentyRoundApproachTrend().map((round, index) => ({
      ...round,
      holes: (index % 2 === 0 ? 9 : 18) as 9 | 18,
    }));
    const { result } = await build({ deps: makeDependencies({ rounds }) });
    expect(new Set(result.internal.envelope.recentRounds.map((round) => round.holes))).toEqual(new Set([9, 18]));
  });

  it.each([
    ['9', 9],
    ['18', 18],
  ] as const)('keeps only %s-hole rounds in %s mode', async (mode, holes) => {
    const rounds = Array.from({ length: 20 }, (_, index) =>
      makeRound(index + 1, { holes: index % 2 === 0 ? 9 : 18 }),
    );
    const { result } = await build({ deps: makeDependencies({ rounds }), mode });
    expect(result.internal.envelope.recentRounds.every((round) => round.holes === holes)).toBe(true);
  });

  it('excludes future rounds', async () => {
    const rounds = [
      ...makeTwentyRoundApproachTrend(),
      makeRound(99, { date: '2026-07-02T12:00:00.000Z' }),
    ];
    const { result } = await build({ deps: makeDependencies({ rounds }) });
    expect(result.internal.envelope.recentRoundIds).not.toContain('99');
  });

  it('keeps a latest round with missing Approach SG in its actual recent position', async () => {
    const rounds = makeTwentyRoundApproachTrend();
    rounds[19] = makeRound(20, { approach: null });
    const { result } = await build({ deps: makeDependencies({ rounds }) });
    expect(result.internal.envelope.recentRoundIds[0]).toBe('20');
    expect(result.internal.envelope.recentRounds[0].components.approach.tracked).toBe(false);
  });

  it('uses the latest eligible round as the canonical identity source', async () => {
    const { result, deps } = await build();
    expect(deps.loadStoredRoundInsight).toHaveBeenCalledWith(expect.objectContaining({ roundId: '20' }));
    expect(result.internal.latestRoundFocus).toMatchObject({ kind: 'available', sourceRoundId: '20' });
  });

  it('uses date, createdAt, then numeric ID for source ordering', async () => {
    const date = '2026-06-20T12:00:00.000Z';
    const createdAt = '2026-06-20T13:00:00.000Z';
    const rounds = [
      makeRound(2, { date, createdAt }),
      makeRound(10, { date, createdAt }),
      makeRound(1, { date, createdAt: '2026-06-20T12:30:00.000Z' }),
    ];
    const { result } = await build({ deps: makeDependencies({ rounds }) });
    expect(result.internal.envelope.recentRoundIds).toEqual(['10', '2', '1']);
  });

  it.each([
    ['approach_leak', 'reinforced_by_latest_round'],
    ['approach_carried', 'latest_round_improved_against_trend'],
    ['putting_leak', 'latest_round_conflicts'],
  ] as const)('resolves strong trend plus %s as %s', async (primaryKey, relationship) => {
    const { result } = await build({
      deps: makeDependencies({ identity: makeIdentity(primaryKey) }),
    });
    expect(result.internal.resolution).toMatchObject({ source: 'trend', relationship });
  });

  it('uses valid latest-round M3 when no trend is eligible', async () => {
    const rounds = Array.from({ length: 3 }, (_, index) => makeRound(index + 1));
    const { result } = await build({ deps: makeDependencies({ rounds }) });
    expect(result.internal.resolution).toMatchObject({
      source: 'latest_round',
      relationship: 'latest_round_fallback',
    });
  });

  it.each([
    ['missing identity', null, true],
    ['stale identity', makeIdentity(), false],
  ] as const)('returns neutral with no trend and %s', async (_label, identity, identityCurrent) => {
    const rounds = Array.from({ length: 3 }, (_, index) => makeRound(index + 1));
    const { result } = await build({
      deps: makeDependencies({ rounds, identity, identityCurrent }),
    });
    expect(result.internal.resolution).toMatchObject({
      source: 'neutral',
      relationship: 'no_supported_focus',
    });
  });

  it('never uses a stale identity', async () => {
    const { result } = await build({ deps: makeDependencies({ identityCurrent: false }) });
    expect(result.internal.latestRoundFocus).toEqual({ kind: 'unavailable', reason: 'stale_identity' });
    expect(result.internal.resolution).toMatchObject({ source: 'trend', relationship: 'trend_only' });
  });

  it('never uses an identity from an older canonical version', async () => {
    const identity = makeIdentity();
    identity.version = 'round_identity_v1.5.0';
    const { result } = await build({ deps: makeDependencies({ identity, identityCurrent: true }) });
    expect(result.internal.latestRoundFocus).toEqual({ kind: 'unavailable', reason: 'stale_identity' });
  });

  it('never uses stored insight messages when canonical identity is missing', async () => {
    const deps = makeDependencies({ identity: null });
    deps.loadStoredRoundInsight.mockResolvedValue({ insights: { messages: ['M1', 'M2', 'Stored M3'] } });
    const { result } = await build({ deps });
    expect(result.internal.latestRoundFocus).toEqual({ kind: 'unavailable', reason: 'missing_identity' });
  });

  it('keeps a valid repeated trend when latest-round confidence is invalid without using legacy copy', async () => {
    const identity = makeIdentity() as unknown as Record<string, unknown>;
    identity.confidence = 'invalid';
    const deps = makeDependencies({ identity: identity as unknown as RoundIdentity });
    deps.loadStoredRoundInsight.mockResolvedValue({
      insights: {
        messages: ['Stored M1', 'Stored M2', 'Legacy Dashboard focus'],
        raw_payload: { round_identity_v1: identity },
      },
    });

    const { result } = await build({ deps });

    expect(result.internal.latestRoundFocus).toEqual({
      kind: 'unavailable',
      reason: 'insufficient_confidence',
    });
    expect(result.internal.resolution).toMatchObject({ source: 'trend', relationship: 'trend_only' });
    expect(result.dto).toMatchObject({ source: 'trend', selectedCategory: 'approach' });
    expect(result.dto).not.toHaveProperty('latestRoundRecommendation');
  });

  it('reflects recent edits on the next request', async () => {
    const initial = await build();
    const editedRounds = makeTwentyRoundApproachTrend().map((round) =>
      Number(round.roundId) >= 16
        ? makeRound(Number(round.roundId), { approach: 0.3, putting: -0.7 })
        : round,
    );
    const edited = await build({ deps: makeDependencies({ rounds: editedRounds }) });
    expect(initial.result.internal.trend).toMatchObject({ kind: 'component', category: 'approach' });
    expect(edited.result.internal.trend).toMatchObject({ kind: 'component', category: 'putting' });
  });

  it('includes a newly added completed round on the next request', async () => {
    const initial = await build();
    const added = makeRound(21, { date: '2026-06-21T12:00:00.000Z' });
    const next = await build({
      deps: makeDependencies({ rounds: [...makeTwentyRoundApproachTrend(), added] }),
    });

    expect(initial.result.internal.envelope.latestEligibleRoundId).toBe('20');
    expect(next.result.internal.envelope.latestEligibleRoundId).toBe('21');
    expect(next.deps.loadStoredRoundInsight).toHaveBeenCalledWith(expect.objectContaining({ roundId: '21' }));
  });

  it('includes a live round only after it is finalized as completed', async () => {
    const finalizedRound = makeRound(21, { date: '2026-06-21T12:00:00.000Z' });
    const activeRound = { ...finalizedRound, completionStatus: 'active' as const };
    const beforeFinalize = await build({
      deps: makeDependencies({ rounds: [...makeTwentyRoundApproachTrend(), activeRound] }),
    });
    const afterFinalize = await build({
      deps: makeDependencies({ rounds: [...makeTwentyRoundApproachTrend(), finalizedRound] }),
    });

    expect(beforeFinalize.result.internal.envelope.latestEligibleRoundId).toBe('20');
    expect(afterFinalize.result.internal.envelope.latestEligibleRoundId).toBe('21');
  });

  it('reflects baseline edits in baseline direction', async () => {
    const improvingRounds = makeTwentyRoundApproachTrend().map((round) =>
      Number(round.roundId) <= 15 ? makeRound(Number(round.roundId), { approach: -0.8 }) : round,
    );
    const stableRounds = improvingRounds.map((round) =>
      Number(round.roundId) <= 15 ? makeRound(Number(round.roundId), { approach: -0.5 }) : round,
    );
    const improving = await build({ deps: makeDependencies({ rounds: improvingRounds }) });
    const stable = await build({ deps: makeDependencies({ rounds: stableRounds }) });
    expect(improving.result.internal.trend).toMatchObject({ baselineDirection: 'improving' });
    expect(stable.result.internal.trend).toMatchObject({ baselineDirection: 'stable' });
  });

  it('recomputes and backfills the baseline deterministically after a baseline-round deletion', async () => {
    const rounds = Array.from({ length: 21 }, (_, index) => {
      const id = index + 1;
      const approach = id >= 17 ? -0.6 : id >= 2 ? -0.8 : 0.6;
      return makeRound(id, { approach });
    });
    const initial = await build({ deps: makeDependencies({ rounds }) });
    const afterDeletion = await build({
      deps: makeDependencies({ rounds: rounds.filter((round) => round.roundId !== '10') }),
    });

    expect(initial.result.internal.envelope.recentRoundIds).toEqual(['21', '20', '19', '18', '17']);
    expect(initial.result.internal.envelope.baselineRoundIds).toEqual([
      '16', '15', '14', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2',
    ]);
    expect(initial.result.internal.trend).toMatchObject({
      kind: 'component',
      baselineAverage: -0.8,
      baselineDirection: 'improving',
    });

    expect(afterDeletion.result.internal.envelope.recentRoundIds).toEqual(
      initial.result.internal.envelope.recentRoundIds,
    );
    expect(afterDeletion.result.internal.envelope.baselineRoundIds).toEqual([
      '16', '15', '14', '13', '12', '11', '9', '8', '7', '6', '5', '4', '3', '2', '1',
    ]);
    expect(afterDeletion.result.internal.envelope.baselineRoundIds).not.toContain('10');
    expect(afterDeletion.result.internal.envelope.baselineRounds).toHaveLength(15);
    const recentIds = new Set(afterDeletion.result.internal.envelope.recentRoundIds);
    expect(
      afterDeletion.result.internal.envelope.baselineRoundIds.every((id) => !recentIds.has(id)),
    ).toBe(true);
    expect(afterDeletion.result.internal.trend).toMatchObject({
      kind: 'component',
      baselineAverage: -0.706667,
      baselineDirection: 'stable',
    });
    expect(afterDeletion.result.internal.resolution).toMatchObject({
      source: 'trend',
      relationship: 'reinforced_by_latest_round',
    });
    expect(afterDeletion.result.dto).not.toHaveProperty('latestRoundRecommendation');
  });

  it('shifts the recent envelope after deletion', async () => {
    const rounds = makeTwentyRoundApproachTrend().filter((round) => round.roundId !== '20');
    const { result } = await build({ deps: makeDependencies({ rounds }) });
    expect(result.internal.envelope.recentRoundIds).toEqual(['19', '18', '17', '16', '15']);
  });

  it('uses the next eligible round after deleting the latest M3 source', async () => {
    const rounds = makeTwentyRoundApproachTrend().filter((round) => round.roundId !== '20');
    const { deps } = await build({ deps: makeDependencies({ rounds }) });
    expect(deps.loadStoredRoundInsight).toHaveBeenCalledWith(expect.objectContaining({ roundId: '19' }));
  });
});

describe('Dashboard Round Focus viewer projection', () => {
  it('omits all numeric trend evidence for a free owner viewing their Dashboard', async () => {
    const { result } = await build({ deps: makeDependencies({ viewerPremium: false }) });
    expect(result.dto.tier).toBe('free');
    expect(result.dto).not.toHaveProperty('evidence');
    expect(result.dto).not.toHaveProperty('latestRoundRecommendation');
    expect(containsForbiddenNumericEvidence(result.dto)).toBe(false);
  });

  it('includes approved numeric trend evidence for a Premium owner', async () => {
    const { result } = await build({ deps: makeDependencies({ viewerPremium: true }) });
    expect(result.dto).toMatchObject({
      tier: 'premium',
      evidence: {
        recentAverage: -0.6,
        baselineAverage: -0.2,
        baselineDelta: -0.4,
        trackedRecentCount: 5,
        negativeRecentCount: 5,
        lowestComponentCount: 5,
      },
    });
  });

  it('does not expose Premium owner evidence to a free viewer', async () => {
    const { result } = await build({
      deps: makeDependencies({ viewerPremium: false }),
      ownerId: BigInt(1),
      viewerId: BigInt(2),
    });
    expect(result.dto.tier).toBe('free');
    expect(result.dto).not.toHaveProperty('evidence');
  });

  it('uses restrictive projection for a Premium viewer of another owner', async () => {
    const { result } = await build({
      deps: makeDependencies({ viewerPremium: true }),
      ownerId: BigInt(1),
      viewerId: BigInt(2),
    });
    expect(result.dto.tier).toBe('free');
    expect(result.dto).not.toHaveProperty('evidence');
    expect(result.dto.sourceRoundId).toBeNull();
  });

  it('projects downgrade and upgrade from the same canonical internal result without regeneration', async () => {
    const deps = makeDependencies();
    const { result } = await build({ deps });
    const free = projectDashboardRoundFocus(result.internal, {
      viewerIsPremium: false,
      allowDetailedEvidence: true,
      allowSourceRoundId: true,
    });
    const premium = projectDashboardRoundFocus(result.internal, {
      viewerIsPremium: true,
      allowDetailedEvidence: true,
      allowSourceRoundId: true,
    });
    expect(free).not.toHaveProperty('evidence');
    expect(premium).toHaveProperty('evidence');
    expect(free.selectedCategory).toBe(premium.selectedCategory);
    expect(deps.loadStoredRoundInsight).toHaveBeenCalledTimes(1);
  });

  it('evaluates viewer entitlement on every request without cache reuse', async () => {
    const deps = makeDependencies({ viewerPremium: false });
    await build({ deps });
    deps.loadViewerPremiumEntitlement.mockResolvedValue(true);
    const second = await build({ deps });
    expect(second.result.dto.tier).toBe('premium');
    expect(deps.loadViewerPremiumEntitlement).toHaveBeenCalledTimes(2);
  });
});
