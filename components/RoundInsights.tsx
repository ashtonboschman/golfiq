'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles, Lock } from 'lucide-react';

interface RoundInsightsProps {
  roundId: string;
  isPremium: boolean;
}

export default function RoundInsights({ roundId, isPremium }: RoundInsightsProps) {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (!isPremium) {
      setLoading(false);
      return;
    }

    const fetchInsights = async () => {
      try {
        const res = await fetch(`/api/rounds/${roundId}/insights`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || 'Failed to fetch insights');
        }

        setInsights(data.insights?.messages || []);
      } catch (err: any) {
        console.error('Error fetching insights:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [roundId, isPremium]);

  if (!isPremium) {
    return (
      <div className="card insights-card">
        <div className="insights-header">
          <div className="insights-title">
            <Sparkles size={20} />
            <h3>AI Performance Insights</h3>
          </div>
        </div>
        <div className="premium-gate">
          <Lock size={32} />
          <p>Upgrade to Premium to unlock AI-powered post-round insights</p>
          <button
          className="btn btn-upgrade"
          onClick={() => router.push('/pricing')}
        >
          Upgrade to Premium
        </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card insights-card">
        <div className="insights-header">
          <div className="insights-title">
            <Sparkles size={20} />
            <h3>AI Performance Insights</h3>
          </div>
        </div>
        <div className="insights-loading">
          <p>Analyzing your round...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card insights-card">
        <div className="insights-header">
          <div className="insights-title">
            <Sparkles size={20} />
            <h3>AI Performance Insights</h3>
          </div>
        </div>
        <div className="insights-error">
          <p>Unable to generate insights: {error}</p>
        </div>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <div className="card insights-card">
      <div className="insights-header">
        <div className="insights-title">
          <Sparkles size={20} />
          <h3>AI Performance Insights</h3>
        </div>
        <span className="insights-badge">Premium</span>
      </div>
      <div className="insights-content">
        {insights.map((message, idx) => (
          <div key={idx} className="insight-message">
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}
