'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles, Lock, RefreshCw, Flame, CircleCheck, CircleAlert, Info } from 'lucide-react';

interface RoundInsightsProps {
  roundId: string;
  isPremium: boolean;
}

type RoundInsightsResponse = {
  messages: string[];
  message_levels?: InsightLevel[];
  visible_count?: number;
};

type InsightLevel = 'great' | 'success' | 'warning' | 'info';

const DEFAULT_LEVEL: InsightLevel = 'info';

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

export default function RoundInsights({ roundId, isPremium }: RoundInsightsProps) {
  const router = useRouter();
  const [insights, setInsights] = useState<RoundInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    try {
      const res = await fetch(`/api/rounds/${roundId}/insights`, {
        credentials: 'include',
      });

      // If the viewer isn't authenticated (or can't access this round), don't spam console.
      if (res.status === 401 || res.status === 403) {
        setInsights({ messages: [], visible_count: 0 });
        setError(null);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch insights');
      setInsights(normalizeInsightsPayload(data.insights, isPremium));
      setError(null);
    } catch (err: any) {
      console.error('Error fetching insights:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [roundId, isPremium]);

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
      setInsights(normalizeInsightsPayload(data.insights, isPremium));
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
        <span className="insights-badge">{isPremium ? 'Premium' : 'Free'}</span>
        <button
          type="button"
          className="btn btn-toggle"
          onClick={handleRegenerate}
          disabled={regenerating || loading}
        >
          {regenerating ? <RefreshCw className="spinning" size={16} /> : <RefreshCw size={16} />} Regenerate
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="card insights-card">
      <Header />
      <div className="insights-loading">
        <p>Analyzing your round...</p>
      </div>
    </div>
  );

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
