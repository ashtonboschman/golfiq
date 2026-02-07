'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles, Lock } from 'lucide-react';

interface RoundInsightsProps {
  roundId: string;
  isPremium: boolean;
}

export default function RoundInsights({ roundId, isPremium }: RoundInsightsProps) {
  const router = useRouter();
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    try {
      const res = await fetch(`/api/rounds/${roundId}/insights`, {
        credentials: 'include',
      });

      // If the viewer isn't authenticated (or can't access this round), don't spam console.
      if (res.status === 401 || res.status === 403) {
        setInsights([]);
        setError(null);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch insights');
      setInsights(data.insights?.messages || []);
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
        {isPremium && <span className="insights-badge">Premium</span>}
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
    return (
      <div className="card insights-card">
        <Header />
        {insights && insights.length > 0 && (
          <div className="insights-content">
            {insights.map((message, idx) => (
              <div key={idx} className="insight-message">{message}</div>
            ))}
          </div>
        )}
        <div className="premium-gate">
          <div className="premium-gate-top">
            <Lock size={50} />
            <p>Want to find out <strong>exactly</strong> what's costing you strokes?</p>
          </div>
          <div className="premium-gate-bottom">
            <p>Unlock AI insights to see your strengths, mistakes, and quick tips to lower your score.</p>
          </div>
          
          <button className="btn btn-upgrade" onClick={() => router.push('/pricing')}>
            Unlock My Insights
          </button>
        </div>
      </div>
    );
  }

  // -------------------------
  // PREMIUM VIEW
  // -------------------------
  if (!insights || insights.length === 0) return null;

  return (
    <div className="card insights-card">
      <Header />
      <div className="insights-content">
        {insights.map((message, idx) => (
          <div key={idx} className="insight-message">{message}</div>
        ))}
      </div>
    </div>
  );
}
