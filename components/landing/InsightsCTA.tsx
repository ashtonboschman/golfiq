'use client';

import Link from 'next/link';
import { Sparkles, Target, LineChart } from 'lucide-react';

export default function InsightsCTA() {
  const insights = [
    {
      icon: <Sparkles size={24} />,
      title: 'Round Insights',
      description: 'Get a plain-language read on what really shaped the score.',
    },
    {
      icon: <Target size={24} />,
      title: 'Biggest Leak',
      description: 'Spot the part of the game that is costing the most and needs attention first.',
    },
    {
      icon: <LineChart size={24} />,
      title: 'Next Focus',
      description: 'Know what to work on next without overcomplicating the plan.',
    },
  ];

  return (
    <section id="insights" className="card landing-insights">
      <div className="landing-insights-content">
        <div className="landing-insights-text">
          <span className="landing-premium-badge">Premium Feature</span>
          <h2 className="landing-insights-title">
            See What Cost You Strokes and <span className="accent-text">What Held Up</span>
          </h2>
          <p className="landing-insights-subtitle">
            GolfIQ turns your score, stats, and round patterns into a clear read you can use next time out.
          </p>

          <div className="landing-insights-list">
            {insights.map((insight, index) => (
              <div key={index} className="card landing-insight-item">
                <div className="landing-insight-icon">{insight.icon}</div>
                <div>
                  <h4 className="landing-insight-item-title">{insight.title}</h4>
                  <p className="landing-insight-item-description">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>

          <Link href="/onboarding?source=landing" className="btn btn-accent btn-large landing-insights-cta">
            Get Started
          </Link>
        </div>
      </div>
    </section>
  );
}
