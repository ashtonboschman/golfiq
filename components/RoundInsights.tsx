'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Lock, RefreshCw, Flame, CircleCheck, CircleAlert, Info } from 'lucide-react';
import { RoundInsightsSkeleton } from '@/components/skeleton/PageSkeletons';

interface RoundInsightsProps {
  roundId: string;
  isPremium: boolean;
  isPremiumLoading?: boolean;
  initialInsightsPayload?: unknown;
}

type RoundInsightsResponse = {
  messages: string[];
  message_levels?: InsightLevel[];
  visible_count?: number;
};

type InsightLevel = 'great' | 'success' | 'warning' | 'info';

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
    return { messages: [], visible_count: 0 };
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Failed to fetch insights');
  }

  return normalizeInsightsPayload(data.insights, isPremium);
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
  return message.replace(/^(?:🔥|✅|⚠️|ℹ️)\s*/u, '').trim();
}

function inferLevelFromMessage(message: string): InsightLevel {
  if (message.startsWith('🔥')) return 'great';
  if (message.startsWith('✅')) return 'success';
  if (message.startsWith('⚠️')) return 'warning';
  if (message.startsWith('ℹ️')) return 'info';
  return DEFAULT_LEVEL;
}

function normalizeMessageLevels(messages: string[], levels: unknown): InsightLevel[] {
  const validLevels = Array.isArray(levels)
    ? levels.filter((level): level is InsightLevel =>
        level === 'great' || level === 'success' || level === 'warning' || level === 'info',
      )
    : [];

  return messages.map((message, index) => validLevels[index] ?? inferLevelFromMessage(message));
}

function normalizeInsightsPayload(rawInsights: any, isPremium: boolean): RoundInsightsResponse {
  const rawMessages = Array.isArray(rawInsights?.messages) ? rawInsights.messages : [];
  const messages = rawMessages.map((message: unknown) => stripMessagePrefix(String(message ?? '')));
  const messageLevels = normalizeMessageLevels(rawMessages, rawInsights?.message_levels);
  const visibleCountRaw = Number(rawInsights?.visible_count);
  const visibleCount = Number.isFinite(visibleCountRaw)
    ? Math.max(0, Math.min(messages.length, Math.floor(visibleCountRaw)))
    : isPremium
      ? messages.length
      : Math.min(1, messages.length);

  return {
    messages,
    message_levels: messageLevels,
    visible_count: visibleCount,
  };
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
  const { data: session } = useSession();
  const viewerUserId = session?.user?.id ? String(session.user.id) : 'anon';
  const cacheKey = getRoundInsightsCacheKey(roundId, isPremium, viewerUserId);
  const normalizedInitialInsights = useMemo(
    () => (initialInsightsPayload ? normalizeInsightsPayload(initialInsightsPayload, isPremium) : null),
    [initialInsightsPayload, isPremium],
  );
  const initialCachedInsights = readRoundInsightsCache(cacheKey);
  const initialInsights = initialCachedInsights ?? normalizedInitialInsights;
  const [insights, setInsights] = useState<RoundInsightsResponse | null>(initialInsights);
  const [loading, setLoading] = useState(!initialInsights);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedCacheKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!normalizedInitialInsights) return;

    writeRoundInsightsCache(cacheKey, normalizedInitialInsights);
    setInsights((prev) => prev ?? normalizedInitialInsights);
    setLoading(false);
    setError(null);
  }, [cacheKey, normalizedInitialInsights]);

  const fetchInsights = async ({ showLoading = false, forceRefresh = false }: { showLoading?: boolean; forceRefresh?: boolean } = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const cached = readRoundInsightsCache(cacheKey);
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
  };

  useEffect(() => {
    if (isPremiumLoading) return;
    if (fetchedCacheKeyRef.current === cacheKey) return;
    fetchedCacheKeyRef.current = cacheKey;
    const hasCached = Boolean(readRoundInsightsCache(cacheKey) ?? normalizedInitialInsights);
    fetchInsights({ showLoading: !hasCached, forceRefresh: true });
  }, [cacheKey, isPremiumLoading, normalizedInitialInsights]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/insights`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401 || res.status === 403) {
        setInsights({ messages: [], visible_count: 0 });
        setError(null);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to regenerate insights');
      const nextInsights = normalizeInsightsPayload(data.insights, isPremium);
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
          <span className={`insights-badge ${isPremium ? 'is-premium' : 'is-free'}`}>
            {isPremium ? 'Premium' : 'Free'}
          </span>
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

  // -------------------------
  // FREE USER VIEW
  // -------------------------
  if (!isPremium) {
    const messages = insights?.messages ?? [];
    const messageLevels = insights?.message_levels ?? [];
    const visibleCount = Number.isFinite(Number(insights?.visible_count))
      ? Math.max(0, Math.min(messages.length, Math.floor(Number(insights?.visible_count))))
      : Math.min(1, messages.length);
    const visibleMessages = messages.slice(0, visibleCount || 1);
    const visibleLevels = messageLevels.slice(0, visibleMessages.length);
    const blurredPreviewMessages = [
      ...messages.slice(Math.max(visibleCount, 1), Math.max(visibleCount, 1) + 2),
      'Premium insight preview',
      'Premium insight preview',
    ].slice(0, 2);
    const blurredPreviewLevels = [
      ...messageLevels.slice(Math.max(visibleCount, 1), Math.max(visibleCount, 1) + 2),
      'info',
      'info',
    ].slice(0, 2) as InsightLevel[];

    return (
      <div className="card insights-card">
        <Header />
        {visibleMessages.length > 0 && (
          <div className="insights-content">
            {visibleMessages.map((message, idx) => (
              <div key={`visible-${idx}`} className="insight-message">
                <div className="insight-message-content">
                  <LevelIcon level={visibleLevels[idx] ?? DEFAULT_LEVEL} />
                  <span className="insight-message-text">{message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="locked-section round-insights-lock-section">
          <div className="locked-blur-content">
            <div className="insights-content">
              {blurredPreviewMessages.map((message, idx) => (
                <div key={`blur-preview-${idx}`} className="insight-message overall-insight-fake">
                  <div className="insight-message-content">
                    <LevelIcon level={blurredPreviewLevels[idx] ?? DEFAULT_LEVEL} />
                    <span className="insight-message-text">{message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="locked-overlay has-cta">
            <div className="locked-overlay-card">
              <Lock size={50} className="locked-overlay-icon" />
              <h4>Want to find out exactly what&apos;s costing you strokes?</h4>
              <p>Unlock Intelligent Insights to see your strengths, mistakes, and personalized recommendations to lower your score.</p>
              <button className="btn btn-upgrade" onClick={() => router.push('/pricing')}>
                Unlock My Insights
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------
  // PREMIUM VIEW
  // -------------------------
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
    </div>
  );
}
