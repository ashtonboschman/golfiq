'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles, Lock } from 'lucide-react';

interface RoundInsightsProps {
  roundId: string;
  isPremium: boolean;
}

type RoundInsightsResponse = {
  messages: string[];
  visible_count?: number;
};

export default function RoundInsights({ roundId, isPremium }: RoundInsightsProps) {
  const router = useRouter();
  const [insights, setInsights] = useState<RoundInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
      const messages = Array.isArray(data.insights?.messages) ? data.insights.messages : [];
      const visibleCountRaw = Number(data.insights?.visible_count);
      const visibleCount = Number.isFinite(visibleCountRaw)
        ? Math.max(0, Math.min(messages.length, Math.floor(visibleCountRaw)))
        : isPremium
          ? messages.length
          : Math.min(1, messages.length);

      setInsights({
        messages,
        visible_count: visibleCount,
      });
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

  const Header = () => (
    <div className="insights-header">
      <div className="insights-title">
        <Sparkles size={20} />
        <h3>AI Performance Insights</h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="insights-badge">{isPremium ? 'Premium' : 'Free'}</span>
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
    const visibleCount = Number.isFinite(Number(insights?.visible_count))
      ? Math.max(0, Math.min(messages.length, Math.floor(Number(insights?.visible_count))))
      : Math.min(1, messages.length);
    const visibleMessages = messages.slice(0, visibleCount || 1);
    const blurredPreviewMessages = [
      ...messages.slice(Math.max(visibleCount, 1), Math.max(visibleCount, 1) + 2),
      'Premium insight preview',
      'Premium insight preview',
    ].slice(0, 2);

    return (
      <div className="card insights-card">
        <Header />
        {visibleMessages.length > 0 && (
          <div className="insights-content">
            {visibleMessages.map((message, idx) => (
              <div key={`visible-${idx}`} className="insight-message">{message}</div>
            ))}
          </div>
        )}

        <div className="locked-section round-insights-lock-section">
          <div className="locked-blur-content">
            <div className="insights-content">
              {blurredPreviewMessages.map((message, idx) => (
                <div key={`blur-preview-${idx}`} className="insight-message overall-insight-fake">
                  {message}
                </div>
              ))}
            </div>
          </div>
          <div className="locked-overlay has-cta">
            <div className="locked-overlay-card">
              <Lock size={50} className="locked-overlay-icon" />
              <h4>Want to find out exactly what&apos;s costing you strokes?</h4>
              <p>Unlock AI insights to see your strengths, mistakes, and quick tips to lower your score.</p>
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
          <div key={idx} className="insight-message">{message}</div>
        ))}
      </div>
    </div>
  );
}
