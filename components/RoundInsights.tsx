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
};

type InsightLevel = 'great' | 'success' | 'warning' | 'info';
type InsightConfidence = 'LOW' | 'MED' | 'HIGH';

const DEFAULT_LEVEL: InsightLevel = 'info';
const SHOW_POST_ROUND_REGENERATE = false;
const ROUND_INSIGHTS_CACHE_TTL_MS = 30_000;

type RoundInsightsCacheEntry = {
  data: RoundInsightsResponse;
  fetchedAt: number;
};

const roundInsightsCache = new Map<string, RoundInsightsCacheEntry>();
const roundInsightsInFlight = new Map<string, Promise<RoundInsightsResponse>>();

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
  };
}

function formatConfidenceLabel(value: InsightConfidence | undefined): string | null {
  if (!value) return null;
  if (value === 'LOW') return 'Low';
  if (value === 'MED') return 'Medium';
  return 'High';
}

function getConfidenceTone(value: InsightConfidence | undefined): 'low' | 'medium' | 'high' {
  if (value === 'LOW') return 'low';
  if (value === 'HIGH') return 'high';
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
  }, [showConfidenceInfo]);

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

  const confidenceLabel = formatConfidenceLabel(insights?.confidence);
  const confidenceTone = getConfidenceTone(insights?.confidence);

  const Header = () => (
    <div className="insights-header">
      <div className="insights-title">
        <Sparkles size={20} />
        <h3>Performance Insights</h3>
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
              className={`insights-confidence-pill is-${confidenceTone}`}
              aria-label={`Insight confidence: ${confidenceLabel ?? 'Medium'}`}
              onClick={() => setShowConfidenceInfo((prev) => !prev)}
            >
              {confidenceLabel ?? 'Medium'}
            </button>
            {showConfidenceInfo && (
              <div
                ref={confidenceContentRef}
                className={`info-tooltip-content ${confidenceTooltipPosition} ${confidenceTooltipVertical} ${confidenceTooltipIsPositioned ? 'ready' : 'measuring'} insights-confidence-popover`}
              >
                <h4>Insight Confidence</h4>
                <p>
                  This shows how much data GolfIQ has behind this round&apos;s insights. Low means limited detail. Medium means some stats and trends are available. High means stronger data and clearer trends.
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

  if (error) return (
    <div className="card insights-card">
      <Header />
      <div className="insights-error">
        <p>Unable to load insights: {error}</p>
      </div>
    </div>
  );

  if (!insights || insights.messages.length === 0) return null;

  return (
    <div className="card insights-card">
      <Header />
      <div className="insights-content">
        {insights.messages.map((message, idx) => (
          <div key={idx} className="insight-message">
            <div className="insight-message-content">
              <LevelIcon level={(insights.message_levels?.[idx] ?? DEFAULT_LEVEL)} />
              <span className="insight-message-text">{message}</span>
            </div>
          </div>
        ))}
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
              <h4>Unlock exactly what&apos;s costing you strokes</h4>
              <p>See your biggest weakness and how many strokes it&apos;s costing per round.</p>
              <p className="round-insights-lock-bridge">Your full breakdown is ready.</p>
              <button className="btn btn-upgrade" onClick={() => { trackUpgradeClick('round_insights_cta'); router.push('/pricing'); }}>
                Unlock Full Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


