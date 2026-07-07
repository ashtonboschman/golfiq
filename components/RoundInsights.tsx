'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Flame, CircleCheck, CircleAlert, Info, Lock } from 'lucide-react';
import { RoundInsightsSkeleton } from '@/components/skeleton/PageSkeletons';
import { consumeRoundInsightsRefreshPending } from '@/lib/insights/insightsNudge';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import { useAdaptiveTooltipPlacement } from '@/lib/ui/useAdaptiveTooltipPlacement';
import { composeRoundIdentityDisplay } from '@/lib/insights/roundIdentity/compose';
import type {
  RoundIdentity,
  RoundIdentityDirectionalEvidence,
  RoundIdentityEvidenceArea,
} from '@/lib/insights/roundIdentity/types';

interface RoundInsightsProps {
  roundId: string;
  isPremium: boolean;
  isPremiumLoading?: boolean;
  initialInsightsPayload?: unknown;
}

type RoundInsightsResponse = {
  messages: string[];
  message_levels?: InsightLevel[];
  confidence?: InsightConfidence;
  round_identity_v1?: RoundIdentity | null;
  round_number?: number | null;
};

type InsightLevel = 'great' | 'success' | 'warning' | 'info';
type InsightConfidence = 'LOW' | 'MED' | 'HIGH';

const DEFAULT_LEVEL: InsightLevel = 'info';
const ROUND_INSIGHTS_CACHE_TTL_MS = 30_000;
const roundInsightsViewedKeys = new Set<string>();

type RoundInsightsCacheEntry = {
  data: RoundInsightsResponse;
  fetchedAt: number;
};

const roundInsightsCache = new Map<string, RoundInsightsCacheEntry>();
const roundInsightsInFlight = new Map<string, Promise<RoundInsightsResponse>>();
const DISPLAY_EVIDENCE_AREAS = new Set<RoundIdentityEvidenceArea>([
  'putting',
  'approach',
  'off_tee',
  'short_game',
  'penalties',
  'big_numbers',
  'scoring',
  'unknown',
]);
const ROUND_IDENTITY_PRIMARY_KEYS = new Set<RoundIdentity['primaryKey']>([
  'score_only_baseline',
  'no_clear_separator',
  'breakthrough',
  'clean_control',
  'all_around_strong',
  'approach_carried',
  'tee_controlled',
  'putting_saved',
  'short_game_rescue',
  'steady_scoring',
  'survival',
  'approach_leak',
  'tee_trouble',
  'penalty_damaged',
  'putting_leak',
  'short_game_pressure',
  'scoring_chance_missed',
  'volatile_scoring',
  'big_number',
  'everything_leaked',
]);
const ROUND_IDENTITY_MODIFIER_KEYS = new Set<RoundIdentity['modifiers'][number]>([
  'one_hole_damage',
  'blow_up_stretch',
  'bounce_back',
  'fast_start_slow_finish',
  'slow_start_strong_finish',
  'par_3_problem',
  'par_5_scoring',
  'no_damage',
  'repeated_bogeys',
  'good_score_bad_process',
  'bad_score_good_process',
  'tee_accuracy_leak',
  'green_hitting_strength',
  'putting_conversion_issue',
  'short_game_stress',
]);

function getRoundInsightsCacheKey(roundId: string, isPremium: boolean, userId: string): string {
  return `${userId}:${roundId}:${isPremium ? 'premium' : 'free'}`;
}

function readRoundInsightsCache(cacheKey: string): RoundInsightsResponse | null {
  const cached = roundInsightsCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.fetchedAt > ROUND_INSIGHTS_CACHE_TTL_MS) {
    roundInsightsCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function writeRoundInsightsCache(cacheKey: string, data: RoundInsightsResponse): void {
  roundInsightsCache.set(cacheKey, {
    data,
    fetchedAt: Date.now(),
  });
}

async function fetchRoundInsights(roundId: string, isPremium: boolean): Promise<RoundInsightsResponse> {
  const res = await fetch(`/api/rounds/${roundId}/insights`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    return { messages: [] };
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Failed to fetch insights');
  }

  return normalizeInsightsPayload(data.insights);
}

function getOrCreateRoundInsightsRequest(
  cacheKey: string,
  roundId: string,
  isPremium: boolean,
): Promise<RoundInsightsResponse> {
  const existingRequest = roundInsightsInFlight.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchRoundInsights(roundId, isPremium).finally(() => {
    roundInsightsInFlight.delete(cacheKey);
  });

  roundInsightsInFlight.set(cacheKey, request);
  return request;
}

function stripMessagePrefix(message: string): string {
  return message.trim();
}

function normalizeInsightLevel(level: unknown): InsightLevel {
  return level === 'great' || level === 'success' || level === 'warning' || level === 'info'
    ? level
    : DEFAULT_LEVEL;
}

function normalizeMessageLevels(messages: string[], levels: unknown): InsightLevel[] {
  const validLevels = Array.isArray(levels)
    ? levels.map(normalizeInsightLevel)
    : [];

  return messages.map((_, index) => validLevels[index] ?? DEFAULT_LEVEL);
}

function normalizeRoundIdentityPayload(rawIdentity: unknown): RoundIdentity | null {
  if (!rawIdentity || typeof rawIdentity !== 'object') return null;
  const identity = rawIdentity as Record<string, unknown>;
  if (typeof identity.title !== 'string' || typeof identity.summary !== 'string') return null;
  const primaryKey = String(identity.primaryKey ?? 'score_only_baseline') as RoundIdentity['primaryKey'];

  const normalizeDisplayArea = (value: unknown): RoundIdentityEvidenceArea => {
    const key = String(value ?? 'unknown') as RoundIdentityEvidenceArea;
    return DISPLAY_EVIDENCE_AREAS.has(key) ? key : 'unknown';
  };
  const normalizeDirectional = (value: unknown): RoundIdentityDirectionalEvidence | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const directional = value as Record<string, unknown>;
    if (directional.area !== 'fir' && directional.area !== 'gir') return undefined;
    if (!['left', 'right', 'short', 'long'].includes(String(directional.dominantDirection))) return undefined;
    if (directional.confidence !== 'medium' && directional.confidence !== 'high') return undefined;
    const count = Number(directional.count);
    const totalDirectionalMisses = Number(directional.totalDirectionalMisses);
    if (!Number.isFinite(count) || !Number.isFinite(totalDirectionalMisses) || count <= 0 || totalDirectionalMisses < count) {
      return undefined;
    }
    return {
      area: directional.area,
      dominantDirection: directional.dominantDirection as RoundIdentityDirectionalEvidence['dominantDirection'],
      count: Math.round(count),
      totalDirectionalMisses: Math.round(totalDirectionalMisses),
      confidence: directional.confidence,
    };
  };

  return {
    version: String(identity.version ?? ''),
    inputHash: String(identity.inputHash ?? ''),
    primaryKey: ROUND_IDENTITY_PRIMARY_KEYS.has(primaryKey) ? primaryKey : 'score_only_baseline',
    title: String(identity.title),
    summary: String(identity.summary),
    shapedBy: Array.isArray(identity.shapedBy) ? identity.shapedBy.map((item) => String(item)) : [],
    nextRoundFocus: String(identity.nextRoundFocus ?? ''),
    modifiers: (Array.isArray(identity.modifiers) ? identity.modifiers : [])
      .map((item) => String(item) as RoundIdentity['modifiers'][number])
      .filter((item) => ROUND_IDENTITY_MODIFIER_KEYS.has(item)),
    evidenceLevel:
      identity.evidenceLevel === 'score_only' || identity.evidenceLevel === 'aggregate_stats' || identity.evidenceLevel === 'hole_by_hole'
        ? identity.evidenceLevel
        : 'score_only',
    confidence:
      identity.confidence === 'building' || identity.confidence === 'moderate' || identity.confidence === 'strong'
        ? identity.confidence
        : 'building',
    sampleContext:
      identity.sampleContext === 'first_round' || identity.sampleContext === 'early' || identity.sampleContext === 'established'
        ? identity.sampleContext
        : 'first_round',
    tone:
      identity.tone === 'fix' || identity.tone === 'repeat' || identity.tone === 'build' || identity.tone === 'explain'
        ? identity.tone
        : 'explain',
    overallTone:
      identity.overallTone === 'great' ||
      identity.overallTone === 'success' ||
      identity.overallTone === 'warning' ||
      identity.overallTone === 'info'
        ? identity.overallTone
        : undefined,
    displayLevels:
      identity.displayLevels && typeof identity.displayLevels === 'object'
        ? {
            story: normalizeInsightLevel((identity.displayLevels as Record<string, unknown>).story),
            worked: normalizeInsightLevel((identity.displayLevels as Record<string, unknown>).worked),
            watch: normalizeInsightLevel((identity.displayLevels as Record<string, unknown>).watch),
          }
        : undefined,
    entryMode:
      identity.entryMode === 'post_round' || identity.entryMode === 'live_round' || identity.entryMode === 'unknown'
        ? identity.entryMode
        : 'unknown',
    statCompletenessScore: Number(identity.statCompletenessScore ?? 0),
    displayEvidence:
      identity.displayEvidence && typeof identity.displayEvidence === 'object'
        ? {
            scoreText: typeof (identity.displayEvidence as Record<string, unknown>).scoreText === 'string'
              ? String((identity.displayEvidence as Record<string, unknown>).scoreText)
              : undefined,
            baselineDeltaText: typeof (identity.displayEvidence as Record<string, unknown>).baselineDeltaText === 'string'
              ? String((identity.displayEvidence as Record<string, unknown>).baselineDeltaText)
              : undefined,
            strongestArea:
              (identity.displayEvidence as Record<string, unknown>).strongestArea &&
              typeof (identity.displayEvidence as Record<string, unknown>).strongestArea === 'object'
                ? {
                    area: normalizeDisplayArea(((identity.displayEvidence as Record<string, unknown>).strongestArea as Record<string, unknown>).area),
                    label: String(((identity.displayEvidence as Record<string, unknown>).strongestArea as Record<string, unknown>).label ?? ''),
                    valueText: String(((identity.displayEvidence as Record<string, unknown>).strongestArea as Record<string, unknown>).valueText ?? ''),
                    detailText: String(((identity.displayEvidence as Record<string, unknown>).strongestArea as Record<string, unknown>).detailText ?? ''),
                  }
                : undefined,
            weakestArea:
              (identity.displayEvidence as Record<string, unknown>).weakestArea &&
              typeof (identity.displayEvidence as Record<string, unknown>).weakestArea === 'object'
                ? {
                    area: normalizeDisplayArea(((identity.displayEvidence as Record<string, unknown>).weakestArea as Record<string, unknown>).area),
                    label: String(((identity.displayEvidence as Record<string, unknown>).weakestArea as Record<string, unknown>).label ?? ''),
                    valueText: String(((identity.displayEvidence as Record<string, unknown>).weakestArea as Record<string, unknown>).valueText ?? ''),
                    detailText: String(((identity.displayEvidence as Record<string, unknown>).weakestArea as Record<string, unknown>).detailText ?? ''),
                  }
                : undefined,
            hbhStory:
              (identity.displayEvidence as Record<string, unknown>).hbhStory &&
              typeof (identity.displayEvidence as Record<string, unknown>).hbhStory === 'object'
                ? {
                    label: String(((identity.displayEvidence as Record<string, unknown>).hbhStory as Record<string, unknown>).label ?? ''),
                    detailText: String(((identity.displayEvidence as Record<string, unknown>).hbhStory as Record<string, unknown>).detailText ?? ''),
                  }
                : undefined,
            directional: normalizeDirectional(
              (identity.displayEvidence as Record<string, unknown>).directional,
            ),
          }
        : undefined,
    strength:
      identity.strength && typeof identity.strength === 'object'
        ? {
            label: String((identity.strength as Record<string, unknown>).label ?? ''),
            detail: String((identity.strength as Record<string, unknown>).detail ?? ''),
          }
        : undefined,
    leak:
      identity.leak && typeof identity.leak === 'object'
        ? {
            label: String((identity.leak as Record<string, unknown>).label ?? ''),
            detail: String((identity.leak as Record<string, unknown>).detail ?? ''),
          }
        : undefined,
  } satisfies RoundIdentity;
}

function normalizeInsightsPayload(rawInsights: any): RoundInsightsResponse {
  const rawMessages = Array.isArray(rawInsights?.messages) ? rawInsights.messages : [];
  const messages = rawMessages.map((message: unknown) => stripMessagePrefix(String(message ?? '')));
  const messageLevels = normalizeMessageLevels(rawMessages, rawInsights?.message_levels);
  const confidence: InsightConfidence | undefined =
    rawInsights?.confidence === 'LOW' || rawInsights?.confidence === 'MED' || rawInsights?.confidence === 'HIGH'
      ? rawInsights.confidence
      : undefined;

  return {
    messages,
    message_levels: messageLevels,
    confidence,
    round_identity_v1: normalizeRoundIdentityPayload(rawInsights?.round_identity_v1),
    round_number:
      rawInsights?.round_number != null && Number.isFinite(Number(rawInsights.round_number))
        ? Number(rawInsights.round_number)
        : null,
  };
}

function formatConfidenceLabel(value: InsightConfidence | undefined): string | null {
  if (!value) return null;
  if (value === 'LOW') return 'Building';
  if (value === 'MED') return 'Moderate';
  return 'Strong';
}

function getConfidenceTone(value: InsightConfidence | undefined): 'low' | 'medium' | 'high' {
  if (value === 'LOW') return 'low';
  if (value === 'HIGH') return 'high';
  return 'medium';
}

function formatIdentityConfidenceLabel(value: RoundIdentity['confidence'] | undefined): string | null {
  if (!value) return null;
  if (value === 'building') return 'Building';
  if (value === 'moderate') return 'Moderate';
  return 'Strong';
}

function getIdentityConfidenceTone(value: RoundIdentity['confidence'] | undefined): 'low' | 'medium' | 'high' {
  if (value === 'building') return 'low';
  if (value === 'strong') return 'high';
  return 'medium';
}

function LevelIcon({ level }: { level: InsightLevel }) {
  if (level === 'great') return <Flame size={18} className="insight-message-icon insight-level-great" />;
  if (level === 'success') return <CircleCheck size={18} className="insight-message-icon insight-level-success" />;
  if (level === 'warning') return <CircleAlert size={18} className="insight-message-icon insight-level-warning" />;
  return <Info size={18} className="insight-message-icon insight-level-info" />;
}

export default function RoundInsights({
  roundId,
  isPremium,
  isPremiumLoading = false,
  initialInsightsPayload,
}: RoundInsightsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const viewerUserId = session?.user?.id ? String(session.user.id) : 'anon';
  const cacheKey = getRoundInsightsCacheKey(roundId, isPremium, viewerUserId);
  const shouldBypassCache = useMemo(
    () => consumeRoundInsightsRefreshPending(roundId),
    [roundId],
  );
  const normalizedInitialInsights = useMemo(
    () => (initialInsightsPayload ? normalizeInsightsPayload(initialInsightsPayload) : null),
    [initialInsightsPayload],
  );
  const initialCachedInsights = shouldBypassCache ? null : readRoundInsightsCache(cacheKey);
  const initialInsights = initialCachedInsights ?? normalizedInitialInsights;
  const [insights, setInsights] = useState<RoundInsightsResponse | null>(initialInsights);
  const [loading, setLoading] = useState(!initialInsights);
  const [error, setError] = useState<string | null>(null);
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const fetchedCacheKeyRef = useRef<string | null>(null);
  const {
    containerRef: confidenceTooltipRef,
    tooltipRef: confidenceContentRef,
    displayPosition: confidenceTooltipPosition,
    displayVertical: confidenceTooltipVertical,
    isPositioned: confidenceTooltipIsPositioned,
  } = useAdaptiveTooltipPlacement(showConfidenceInfo);

  const trackUpgradeClick = useCallback((ctaLocation: string) => {
    captureClientEvent(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      {
        cta_location: ctaLocation,
        source_page: pathname,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: Boolean(session?.user?.id),
      },
    );
  }, [pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier]);

  useEffect(() => {
    if (!normalizedInitialInsights) return;

    writeRoundInsightsCache(cacheKey, normalizedInitialInsights);
    setInsights(normalizedInitialInsights);
    setLoading(false);
    setError(null);
  }, [cacheKey, normalizedInitialInsights]);

  const fetchInsights = useCallback(
    async ({ showLoading = false, forceRefresh = false }: { showLoading?: boolean; forceRefresh?: boolean } = {}) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const cached = shouldBypassCache ? null : readRoundInsightsCache(cacheKey);
        if (cached) {
          setInsights(cached);
          setError(null);
          if (!forceRefresh) {
            return;
          }
        }

        const nextInsights = await getOrCreateRoundInsightsRequest(cacheKey, roundId, isPremium);
        writeRoundInsightsCache(cacheKey, nextInsights);
        setInsights(nextInsights);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching insights:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, isPremium, roundId, shouldBypassCache],
  );

  useEffect(() => {
    if (isPremiumLoading) return;
    if (fetchedCacheKeyRef.current === cacheKey) return;
    fetchedCacheKeyRef.current = cacheKey;
    if (normalizedInitialInsights) return;
    const hasCached = Boolean((shouldBypassCache ? null : readRoundInsightsCache(cacheKey)) ?? normalizedInitialInsights);
    fetchInsights({ showLoading: !hasCached, forceRefresh: true });
  }, [cacheKey, fetchInsights, isPremiumLoading, normalizedInitialInsights, shouldBypassCache]);

  useEffect(() => {
    if (!showConfidenceInfo) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!confidenceTooltipRef.current) return;
      if (!confidenceTooltipRef.current.contains(event.target as Node)) {
        setShowConfidenceInfo(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [confidenceTooltipRef, showConfidenceInfo]);

  useEffect(() => {
    if (!insights) return;
    if (insights.messages.length === 0 && !insights.round_identity_v1) return;

    const identity = insights.round_identity_v1;
    const dedupeKey = `${session?.user?.id ?? 'anon'}:${roundId}:${identity?.inputHash ?? 'legacy'}`;
    if (roundInsightsViewedKeys.has(dedupeKey)) return;
    roundInsightsViewedKeys.add(dedupeKey);

    const roundsLifetime =
      insights.round_number != null
        ? insights.round_number
        : identity?.sampleContext === 'first_round'
          ? 1
          : identity?.sampleContext === 'early'
            ? 2
            : identity?.sampleContext === 'established'
              ? 3
              : null;

    const sharedProps = {
      round_id: roundId,
      rounds_lifetime: roundsLifetime,
      is_premium: isPremium,
      has_hbh: identity?.evidenceLevel === 'hole_by_hole',
      has_optional_stats: identity ? identity.evidenceLevel !== 'score_only' : false,
      stat_completeness_score: identity?.statCompletenessScore ?? 0,
    };

    captureClientEvent(
      ANALYTICS_EVENTS.roundInsightsViewed,
      sharedProps,
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: Boolean(session?.user?.id),
      },
    );

    if (!identity) return;

    captureClientEvent(
      ANALYTICS_EVENTS.roundIdentityShown,
      {
        ...sharedProps,
        primaryKey: identity.primaryKey,
        modifiers: identity.modifiers,
        evidenceLevel: identity.evidenceLevel,
        confidence: identity.confidence,
        sampleContext: identity.sampleContext,
        tone: identity.tone,
        entryMode: identity.entryMode,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: Boolean(session?.user?.id),
      },
    );

    if (identity.modifiers.length > 0) {
      captureClientEvent(
        ANALYTICS_EVENTS.roundIdentityModifierShown,
        {
          ...sharedProps,
          primaryKey: identity.primaryKey,
          modifiers: identity.modifiers,
          modifier_count: identity.modifiers.length,
        },
        {
          pathname,
          user: {
            id: session?.user?.id,
            subscription_tier: session?.user?.subscription_tier,
            auth_provider: session?.user?.auth_provider,
          },
          isLoggedIn: Boolean(session?.user?.id),
        },
      );
    }

    if (identity.sampleContext === 'first_round') {
      captureClientEvent(
        ANALYTICS_EVENTS.firstRoundPayoffShown,
        {
          ...sharedProps,
          primaryKey: identity.primaryKey,
          tone: identity.tone,
          evidenceLevel: identity.evidenceLevel,
        },
        {
          pathname,
          user: {
            id: session?.user?.id,
            subscription_tier: session?.user?.subscription_tier,
            auth_provider: session?.user?.auth_provider,
          },
          isLoggedIn: Boolean(session?.user?.id),
        },
      );
    }
  }, [
    insights,
    isPremium,
    pathname,
    roundId,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
  ]);

  const Header = ({
    label,
    tone,
  }: {
    label: string | null;
    tone: 'low' | 'medium' | 'high';
  }) => (
    <div className="insights-header">
      <div className="insights-title">
        <Sparkles size={20} />
        <h3>Round Insights</h3>
      </div>
      <div className="u-flex u-items-center admin-course-inline-actions">
        {isPremiumLoading ? (
          <span className="skeleton u-inline-block u-w-78 u-h-24 u-rounded-pill" />
        ) : (
          <div ref={confidenceTooltipRef} className="info-tooltip-container insights-confidence-tooltip">
            <button
              type="button"
              className={`insights-confidence-pill is-${tone}`}
              aria-label={`Insight confidence: ${label ?? 'Moderate'}`}
              onClick={() => setShowConfidenceInfo((prev) => !prev)}
            >
              {label ?? 'Moderate'}
            </button>
            {showConfidenceInfo && (
              <div
                ref={confidenceContentRef}
                className={`info-tooltip-content ${confidenceTooltipPosition} ${confidenceTooltipVertical} ${confidenceTooltipIsPositioned ? 'ready' : 'measuring'} insights-confidence-popover`}
              >
                <h4>Insight Confidence</h4>
                <p>
                  This shows how much round detail and history GolfIQ has behind the insight. Building means an early read. Moderate means useful evidence that is still getting sharper. Strong means the pattern has both solid detail and enough history behind it.
                </p>
                <div className={`info-tooltip-arrow ${confidenceTooltipPosition} ${confidenceTooltipVertical}`} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const showSkeletonContent = isPremiumLoading || loading;

  if (showSkeletonContent) return <RoundInsightsSkeleton />;

  const normalizedRoundIdentity = insights?.round_identity_v1 ?? null;
  let composedIdentityDisplay: ReturnType<typeof composeRoundIdentityDisplay> | null = null;
  if (normalizedRoundIdentity) {
    try {
      composedIdentityDisplay = composeRoundIdentityDisplay(normalizedRoundIdentity, {
        isFirstRound: normalizedRoundIdentity.sampleContext === 'first_round' || insights?.round_number === 1,
        roundNumber: insights?.round_number ?? null,
      });
    } catch {
      composedIdentityDisplay = null;
    }
  }
  const shouldRenderComposedInsights = isPremium && Boolean(normalizedRoundIdentity && composedIdentityDisplay);
  const shouldRenderLegacyInsights =
    !shouldRenderComposedInsights && Boolean(insights && insights.messages.length > 0);
  const composedIdentity = shouldRenderComposedInsights ? (normalizedRoundIdentity as RoundIdentity) : null;
  const confidenceLabel = shouldRenderComposedInsights
    ? formatIdentityConfidenceLabel(normalizedRoundIdentity?.confidence)
    : formatConfidenceLabel(insights?.confidence);
  const confidenceTone = shouldRenderComposedInsights
    ? getIdentityConfidenceTone(normalizedRoundIdentity?.confidence)
    : getConfidenceTone(insights?.confidence);

  if (error) return (
    <div className="card insights-card">
      <Header label={confidenceLabel} tone={confidenceTone} />
      <div className="insights-error">
        <p>Unable to load insights: {error}</p>
      </div>
    </div>
  );

  if (!insights || (insights.messages.length === 0 && !insights.round_identity_v1)) return null;

  const identity = normalizedRoundIdentity;
  const displayIdentity = composedIdentityDisplay;

  return (
    <div className="card insights-card">
      <Header label={confidenceLabel} tone={confidenceTone} />
      <div className="insights-content">
        {shouldRenderComposedInsights && displayIdentity && composedIdentity && (
          <div className="round-legacy-insights">
            {displayIdentity.insights.map((insight, idx) => (
              <div key={`${insight.kind}-${idx}`} className="insight-message">
                <div className="insight-message-content">
                  <LevelIcon level={insight.level} />
                  <span className="insight-message-text">{insight.body}</span>
                </div>
              </div>
            ))}
            {displayIdentity.progressText && <p className="round-identity-sample-note">{displayIdentity.progressText}</p>}
          </div>
        )}
        {shouldRenderLegacyInsights && (
          <div className="round-legacy-insights">
            {insights.messages.map((message, idx) => (
              <div key={idx} className="insight-message">
                <div className="insight-message-content">
                  <LevelIcon level={(insights.message_levels?.[idx] ?? DEFAULT_LEVEL)} />
                  <span className="insight-message-text">{message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {!isPremium && (
        <div className="locked-section round-insights-lock-section">
          <div className="locked-blur-content">
            <div className="insights-locked-preview-stack">
              <div className="insight-message overall-insight-fake">Premium insight preview</div>
              <div className="insight-message overall-insight-fake">Premium insight preview</div>
              <div className="insight-message overall-insight-fake">Premium insight preview</div>
            </div>
          </div>
          <div className="locked-overlay has-cta">
            <div className="locked-overlay-card">
              <Lock size={36} className="locked-overlay-icon" />
              <h4>Unlock Your Full Round Breakdown</h4>
              <p>See the stats behind each insight and how it shaped your round.</p>
              <button
                className="btn btn-upgrade"
                onClick={() => {
                  captureClientEvent(
                    ANALYTICS_EVENTS.roundIdentityCtaClicked,
                    {
                      round_id: roundId,
                      cta_type: 'unlock_full_breakdown',
                      primaryKey: identity?.primaryKey ?? null,
                    },
                    {
                      pathname,
                      user: {
                        id: session?.user?.id,
                        subscription_tier: session?.user?.subscription_tier,
                        auth_provider: session?.user?.auth_provider,
                      },
                      isLoggedIn: Boolean(session?.user?.id),
                    },
                  );
                  trackUpgradeClick('round_insights_cta');
                  router.push('/pricing');
                }}
              >
                See Premium Plans
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



