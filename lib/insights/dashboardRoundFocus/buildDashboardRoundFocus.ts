import { prisma } from '@/lib/db';
import { isShortGameOpportunityEligible } from '@/lib/insights/trendEvidence';
import { isPremiumUser } from '@/lib/subscription';
import { buildWatchCard } from '@/lib/insights/roundIdentity/copyTemplates';
import { computeCurrentRoundIdentityHash } from '@/lib/insights/roundIdentity/currentIdentityHash';
import type { RoundIdentity } from '@/lib/insights/roundIdentity/types';
import { extractLatestRoundFocus, type LatestRoundFocusCandidate } from './latestRoundFocus';
import {
  selectDashboardRoundEnvelope,
  type DashboardFocusRoundCandidate,
  type DashboardFocusRoundContext,
  type DashboardRoundEnvelope,
} from './roundEnvelope';
import {
  resolveDashboardFocusRelationship,
  type DashboardFocusResolution,
} from './relationshipResolver';
import { resolveDashboardTrendFocus } from './trendResolver';
import type {
  DashboardRoundFocusDto,
  DashboardTrendMode,
  DashboardTrendResult,
} from './types';
export type { DashboardRoundFocusDto, DashboardRoundFocusEvidenceDto } from './types';

export type DashboardRoundFocusInternalResult = {
  envelope: DashboardRoundEnvelope;
  trend: DashboardTrendResult;
  latestRoundFocus: LatestRoundFocusCandidate;
  resolution: DashboardFocusResolution;
};

export type DashboardRoundFocusProjectionOptions = {
  viewerIsPremium: boolean;
  allowDetailedEvidence: boolean;
  allowSourceRoundId: boolean;
};

export type BuildDashboardRoundFocusInput = {
  dashboardOwnerId: bigint;
  viewerId: bigint;
  mode: DashboardTrendMode;
  roundContext: DashboardFocusRoundContext;
  now?: Date;
};

export type DashboardRoundFocusDependencies = {
  loadRoundCandidates(input: {
    dashboardOwnerId: bigint;
    mode: DashboardTrendMode;
    roundContext: DashboardFocusRoundContext;
    now: Date;
  }): Promise<DashboardFocusRoundCandidate[]>;
  loadStoredRoundInsight(input: {
    dashboardOwnerId: bigint;
    roundId: string;
  }): Promise<{ insights: unknown } | null>;
  isStoredIdentityCurrent(input: {
    dashboardOwnerId: bigint;
    roundId: string;
    identity: RoundIdentity;
  }): Promise<boolean>;
  loadViewerPremiumEntitlement(viewerId: bigint): Promise<boolean>;
};

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseDashboardFocusHoleCount(value: unknown): 9 | 18 | null {
  return value === 9 || value === 18 ? value : null;
}

function resolveShortGameOpportunityEligible(holes: 9 | 18 | null, girHit: unknown): boolean {
  if (holes == null) return false;
  const gir = toNumberOrNull(girHit);
  if (gir == null) return false;
  return isShortGameOpportunityEligible(holes, gir);
}

const defaultDependencies: DashboardRoundFocusDependencies = {
  async loadRoundCandidates(input) {
    const holesFilter = input.mode === '9' ? 9 : input.mode === '18' ? 18 : undefined;
    const rows = await prisma.round.findMany({
      where: {
        userId: input.dashboardOwnerId,
        roundContext: input.roundContext,
        date: { lte: input.now },
        ...(holesFilter != null ? { holesPlayed: holesFilter } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        date: true,
        createdAt: true,
        holesPlayed: true,
        roundContext: true,
        girHit: true,
        roundStrokesGained: {
          select: {
            sgOffTee: true,
            sgApproach: true,
            sgShortGame: true,
            sgPutting: true,
            sgResidual: true,
            partialAnalysis: true,
          },
        },
      },
    });

    return rows.map((round: any) => {
      const holes = parseDashboardFocusHoleCount(round.holesPlayed);
      const sg = round.roundStrokesGained ?? null;
      const offTee = toNumberOrNull(sg?.sgOffTee);
      const approach = toNumberOrNull(sg?.sgApproach);
      const shortGame = toNumberOrNull(sg?.sgShortGame);
      const putting = toNumberOrNull(sg?.sgPutting);
      const residual = toNumberOrNull(sg?.sgResidual);
      return {
        roundId: round.id.toString(),
        date: round.date,
        createdAt: round.createdAt,
        playedAt: round.date,
        holes,
        roundContext: round.roundContext,
        completionStatus: 'completed' as const,
        components: {
          off_the_tee: { value: offTee, tracked: offTee != null },
          approach: { value: approach, tracked: approach != null },
          short_game: { value: shortGame, tracked: shortGame != null },
          putting: { value: putting, tracked: putting != null },
        },
        residual: { value: residual, tracked: residual != null },
        shortGameOpportunityEligible: resolveShortGameOpportunityEligible(holes, round.girHit),
        sgPartialAnalysis: sg?.partialAnalysis != null ? Boolean(sg.partialAnalysis) : null,
      } satisfies DashboardFocusRoundCandidate;
    });
  },

  async loadStoredRoundInsight(input) {
    return prisma.roundInsight.findUnique({
      where: { roundId: BigInt(input.roundId) },
      select: { insights: true },
    });
  },

  async isStoredIdentityCurrent(input) {
    const currentHash = await computeCurrentRoundIdentityHash(
      BigInt(input.roundId),
      input.dashboardOwnerId,
    );
    return currentHash != null && currentHash === input.identity.inputHash;
  },

  async loadViewerPremiumEntitlement(viewerId) {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { subscriptionTier: true, subscriptionStatus: true },
    });
    return viewer ? isPremiumUser(viewer) : false;
  },
};

function readStoredIdentity(stored: { insights: unknown } | null): RoundIdentity | null {
  if (!stored?.insights || typeof stored.insights !== 'object') return null;
  const insights = stored.insights as Record<string, any>;
  const identity = insights.raw_payload?.round_identity_v1;
  return identity && typeof identity === 'object' ? (identity as RoundIdentity) : null;
}

function trendReason(trend: DashboardTrendResult): string | null {
  if (trend.kind === 'component') return trend.reason;
  if (trend.kind === 'insufficient_evidence') return trend.reason;
  return trend.kind;
}

export function projectDashboardRoundFocus(
  internal: DashboardRoundFocusInternalResult,
  options: DashboardRoundFocusProjectionOptions,
): DashboardRoundFocusDto {
  const trend = internal.trend.kind === 'component' ? internal.trend : null;
  const latest = internal.latestRoundFocus.kind === 'available' ? internal.latestRoundFocus : null;
  const premium = options.viewerIsPremium && options.allowDetailedEvidence;
  const selectedCategory = internal.resolution.source === 'trend'
    ? trend?.category ?? null
    : internal.resolution.source === 'latest_round'
      ? latest?.category ?? null
      : null;
  const confidence = internal.resolution.source === 'trend'
    ? trend?.confidence ?? 'building'
    : internal.resolution.source === 'latest_round'
      ? latest?.confidence ?? 'building'
      : 'building';

  const dto: DashboardRoundFocusDto = {
    version: 'dashboard_round_focus_v2',
    tier: premium ? 'premium' : 'free',
    source: internal.resolution.source,
    relationship: internal.resolution.relationship,
    selectedCategory,
    confidence,
    trendState: internal.trend.kind,
    baselineDirection: trend?.baselineDirection ?? null,
    latestRoundCategory: latest?.category ?? null,
    latestRoundPolarity: latest?.polarity ?? null,
    sourceRoundId: options.allowSourceRoundId ? latest?.sourceRoundId ?? null : null,
    trendReason: trendReason(internal.trend),
    latestRoundUnavailableReason:
      internal.latestRoundFocus.kind === 'unavailable' ? internal.latestRoundFocus.reason : null,
  };

  if (premium && trend) {
    dto.evidence = {
      recentAverage: trend.recentAverage,
      baselineAverage: trend.baselineAverage,
      baselineDelta: trend.baselineDelta,
      trackedRecentCount: trend.trackedRecentCount,
      negativeRecentCount: trend.negativeRecentCount,
      lowestComponentCount: trend.lowestComponentCount,
      separation: trend.separation,
    };
  }
  return dto;
}

export function createUnavailableDashboardRoundFocusDto(
  reason = 'pipeline_error',
): DashboardRoundFocusDto {
  return {
    version: 'dashboard_round_focus_v2',
    tier: 'free',
    source: 'neutral',
    relationship: 'no_supported_focus',
    selectedCategory: null,
    confidence: 'building',
    trendState: 'insufficient_evidence',
    baselineDirection: null,
    latestRoundCategory: null,
    latestRoundPolarity: null,
    sourceRoundId: null,
    trendReason: reason,
    latestRoundUnavailableReason: reason,
  };
}

export async function buildDashboardRoundFocus(
  input: BuildDashboardRoundFocusInput,
  dependencies: DashboardRoundFocusDependencies = defaultDependencies,
): Promise<{ internal: DashboardRoundFocusInternalResult; dto: DashboardRoundFocusDto }> {
  const now = input.now ?? new Date();
  const rounds = await dependencies.loadRoundCandidates({
    dashboardOwnerId: input.dashboardOwnerId,
    mode: input.mode,
    roundContext: input.roundContext,
    now,
  });
  const envelope = selectDashboardRoundEnvelope({
    rounds,
    mode: input.mode,
    roundContext: input.roundContext,
    now,
  });
  const trend = resolveDashboardTrendFocus({
    recentRounds: envelope.recentRounds,
    baselineRounds: envelope.baselineRounds,
    mode: input.mode,
  });

  let latestRoundFocus: LatestRoundFocusCandidate = {
    kind: 'unavailable',
    reason: 'missing_identity',
  };
  const latestRoundId = envelope.latestEligibleRoundId;
  if (latestRoundId) {
    try {
      const stored = await dependencies.loadStoredRoundInsight({
        dashboardOwnerId: input.dashboardOwnerId,
        roundId: latestRoundId,
      });
      const identity = readStoredIdentity(stored);
      const isCurrent = identity
        ? await dependencies.isStoredIdentityCurrent({
            dashboardOwnerId: input.dashboardOwnerId,
            roundId: latestRoundId,
            identity,
          })
        : false;
      const canonicalRecommendation = identity && isCurrent ? buildWatchCard(identity) : null;
      latestRoundFocus = extractLatestRoundFocus({
        identity,
        sourceRoundId: latestRoundId,
        isCurrent,
        canonicalRecommendation,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Dashboard Round Focus identity lookup failed:', error);
      }
      latestRoundFocus = { kind: 'unavailable', reason: 'stale_identity' };
    }
  }

  const resolution = resolveDashboardFocusRelationship({ trend, latestRoundFocus });
  const internal: DashboardRoundFocusInternalResult = {
    envelope,
    trend,
    latestRoundFocus,
    resolution,
  };
  const viewerIsPremium = await dependencies.loadViewerPremiumEntitlement(input.viewerId);
  const isOwnDashboard = input.viewerId === input.dashboardOwnerId;
  const dto = projectDashboardRoundFocus(internal, {
    viewerIsPremium,
    // Friend/public detailed analytics policy is ambiguous, so phase 3A remains owner-only.
    allowDetailedEvidence: isOwnDashboard,
    allowSourceRoundId: isOwnDashboard,
  });
  return { internal, dto };
}
