'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Flame, CircleCheck, CircleAlert, Info, Lock } from 'lucide-react';
import { RoundInsightsSkeleton } from '@/components/skeleton/PageSkeletons';
import { consumeRoundInsightsRefreshPending } from '@/lib/insights/insightsNudge';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import { useAdaptiveTooltipPlacement } from '@/lib/ui/useAdaptiveTooltipPlacement';
import { composeRoundIdentityDisplay, type RoundIdentityDisplayInsight } from '@/lib/insights/roundIdentity/compose';
import type { RoundIdentity, RoundIdentityEvidenceArea } from '@/lib/insights/roundIdentity/types';

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
const SHOW_POST_ROUND_REGENERATE = false;
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

function normalizeMessageLevels(messages: string[], levels: unknown): InsightLevel[] {
  const validLevels = Array.isArray(levels)
    ? levels.filter((level): level is InsightLevel =>
        level === 'great' || level === 'success' || level === 'warning' || level === 'info',
      )
    : [];

  return messages.map((_, index) => validLevels[index] ?? DEFAULT_LEVEL);
}

function normalizeRoundIdentityPayload(rawIdentity: unknown): RoundIdentity | null {
  if (!rawIdentity || typeof rawIdentity !== 'object') return null;
  const identity = rawIdentity as Record<string, unknown>;
  if (typeof identity.title !== 'string' || typeof identity.summary !== 'string') return null;

  const normalizeDisplayArea = (value: unknown): RoundIdentityEvidenceArea => {
    const key = String(value ?? 'unknown') as RoundIdentityEvidenceArea;
    return DISPLAY_EVIDENCE_AREAS.has(key) ? key : 'unknown';
  };

  return {
    version: String(identity.version ?? ''),
    inputHash: String(identity.inputHash ?? ''),
    primaryKey: String(identity.primaryKey ?? 'score_only_baseline') as RoundIdentity['primaryKey'],
    title: String(identity.title),
    summary: String(identity.summary),
    shapedBy: Array.isArray(identity.shapedBy) ? identity.shapedBy.map((item) => String(item)) : [],
    nextRoundFocus: String(identity.nextRoundFocus ?? ''),
    modifiers: (Array.isArray(identity.modifiers) ? identity.modifiers.map((item) => String(item)) : []) as RoundIdentity['modifiers'],
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

function isDamagePreventionText(text: string): boolean {
  const normalized = text.toLowerCase();
  const phrases = [
    'big-number',
    'big numbers',
    'double',
    'doubles',
    'costly hole',
    'costly holes',
    'costly ones',
    'damage control',
    'closer to bogey',
    'protect bogey',
    'penalty',
    'penalties',
    'one mistake from turning into',
    'bad holes',
    'going sideways',
    'round-changing holes',
  ];
  return phrases.some((phrase) => normalized.includes(phrase));
}

function getComposedInsightLevel(identity: RoundIdentity, insight: RoundIdentityDisplayInsight): InsightLevel {
  const storySuccessPrimaries = new Set<RoundIdentity['primaryKey']>([
    'clean_control',
    'all_around_strong',
    'approach_carried',
    'putting_saved',
    'tee_controlled',
    'short_game_rescue',
    'steady_scoring',
  ]);
  const storyWarningPrimaries = new Set<RoundIdentity['primaryKey']>([
    'penalty_damaged',
    'big_number',
    'volatile_scoring',
    'everything_leaked',
    'approach_leak',
    'tee_trouble',
    'putting_leak',
    'short_game_pressure',
    'scoring_chance_missed',
  ]);
  const leakFramedPrimaries = new Set<RoundIdentity['primaryKey']>([
    'penalty_damaged',
    'big_number',
    'everything_leaked',
    'approach_leak',
    'tee_trouble',
    'putting_leak',
    'short_game_pressure',
    'scoring_chance_missed',
  ]);
  const urgentDamagePrimaries = new Set<RoundIdentity['primaryKey']>([
    'penalty_damaged',
    'big_number',
    'everything_leaked',
  ]);
  const coachingFixPrimaries = new Set<RoundIdentity['primaryKey']>([
    'approach_leak',
    'tee_trouble',
    'putting_leak',
    'short_game_pressure',
  ]);
  const coachingFixAreas = new Set(['approach', 'off_tee', 'putting', 'short_game']);

  if (insight.kind === 'story') {
    if (identity.primaryKey === 'breakthrough') return 'great';
    if (storyWarningPrimaries.has(identity.primaryKey)) return 'warning';
    if (storySuccessPrimaries.has(identity.primaryKey)) return 'success';
    if (identity.primaryKey === 'score_only_baseline' || identity.primaryKey === 'survival') return 'info';
    return 'info';
  }

  if (insight.kind === 'worked') {
    const strongestArea = identity.displayEvidence?.strongestArea;
    const weakestArea = identity.displayEvidence?.weakestArea;
    const m2UsesWeakest =
      Boolean(weakestArea) && (identity.tone === 'fix' || identity.primaryKey === 'penalty_damaged' || !strongestArea);

    if (identity.primaryKey === 'score_only_baseline') return 'info';
    if (leakFramedPrimaries.has(identity.primaryKey)) return 'warning';
    if (identity.tone === 'fix') return 'warning';
    if (m2UsesWeakest) return 'warning';
    if (strongestArea) return 'success';
    return 'info';
  }

  const weakestArea = identity.displayEvidence?.weakestArea;
  const hasDamageModifier =
    identity.modifiers.includes('one_hole_damage') || identity.modifiers.includes('blow_up_stretch');
  const hasDamageWatchText = isDamagePreventionText(insight.body);
  const hasExplicitDamageFocus = hasDamageModifier || hasDamageWatchText;
  const weakestAreaIsUrgentDamage = weakestArea?.area != null && ['penalties', 'big_numbers'].includes(weakestArea.area);

  if (identity.primaryKey === 'score_only_baseline' || identity.primaryKey === 'survival') return 'info';
  if (identity.tone === 'build' || identity.tone === 'explain') return 'info';
  if (hasDamageModifier || urgentDamagePrimaries.has(identity.primaryKey)) return 'warning';
  if (identity.tone === 'fix' && coachingFixPrimaries.has(identity.primaryKey)) return 'info';
  if (identity.tone === 'fix' && weakestAreaIsUrgentDamage) return 'warning';
  if (identity.tone === 'fix' && weakestArea?.area != null && coachingFixAreas.has(weakestArea.area)) return 'info';
  if (identity.tone === 'fix') return 'info';
  if (identity.tone === 'repeat' && hasExplicitDamageFocus) return 'warning';
  if (
    identity.tone === 'repeat' &&
    (identity.primaryKey === 'breakthrough' ||
      storySuccessPrimaries.has(identity.primaryKey))
  ) {
    return 'success';
  }
  return 'info';
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
  const [regenerating, setRegenerating] = useState(false);
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
    setInsights((prev) => prev ?? normalizedInitialInsights);
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
            ? 3
            : identity?.sampleContext === 'established'
              ? 6
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

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/insights`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401 || res.status === 403) {
        setInsights({ messages: [] });
        setError(null);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to regenerate insights');
      const nextInsights = normalizeInsightsPayload(data.insights);
      writeRoundInsightsCache(cacheKey, nextInsights);
      setInsights(nextInsights);
      setError(null);
    } catch (err: any) {
      console.error('Error regenerating insights:', err);
      setError(err.message || 'Failed to regenerate insights');
    } finally {
      setRegenerating(false);
    }
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {SHOW_POST_ROUND_REGENERATE && (
          <button
            type="button"
            className="btn btn-toggle"
            onClick={handleRegenerate}
            disabled={regenerating || loading}
          >
            {regenerating ? <RefreshCw className="spinning" size={16} /> : <RefreshCw size={16} />} Regenerate
          </button>
        )}
        {isPremiumLoading ? (
          <span className="skeleton" style={{ display: 'inline-block', width: 78, height: 24, borderRadius: 999 }} />
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
                  This shows how much data GolfIQ has behind this round's insights. Building means an early read. Moderate means useful signal, but still getting sharper. Strong means enough history to trust the pattern more.
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
        isPremium,
        roundNumber: insights?.round_number ?? null,
      });
    } catch {
      composedIdentityDisplay = null;
    }
  }
  const shouldRenderComposedInsights = Boolean(normalizedRoundIdentity && composedIdentityDisplay);
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
                  <LevelIcon level={getComposedInsightLevel(composedIdentity, insight)} />
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
              <Lock size={50} className="locked-overlay-icon" />
              <h4>See what really cost you strokes</h4>
              <p>Find the part of the game that hurt the score most and what to focus on next.</p>
              <p className="round-insights-lock-bridge">Your full round breakdown is ready.</p>
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
                See the Full Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


