import { Sparkles, Target, TrendingUp } from 'lucide-react';
import LandingTrackedLink from './LandingTrackedLink';

export default function InsightsCTA() {
  const insights = [
    {
      icon: <Sparkles size={28} aria-hidden="true" />,
      title: 'Round Insights',
      description: 'See what shaped your round, what held up, where strokes were lost, and what to take into the next one.',
    },
    {
      icon: <TrendingUp size={28} aria-hidden="true" />,
      title: 'Game Trends',
      description: 'Understand how your recent rounds compare with your usual game through form, strengths, opportunities, and stability.',
    },
    {
      icon: <Target size={28} aria-hidden="true" />,
      title: 'Round Focus',
      description: 'See the clearest scoring focus in your game right now and a practical action to take into your next round.',
    },
  ];

  return (
    <section id="insights" className="card landing-insights">
      <div className="landing-insights-content">
        <div className="landing-insights-text">
          <span className="landing-premium-badge">Premium Insights</span>
          <h2 className="landing-insights-title">
            See What Cost You Strokes and <span className="accent-text">What Held Up</span>
          </h2>
          <p className="landing-insights-subtitle">
            GolfIQ uses the stats you actually tracked to explain the round, show how your game is trending, and surface a clear focus for what comes next.
          </p>

          <div className="landing-insights-list">
            {insights.map((insight, index) => (
              <div key={index} className="card landing-insight-item">
                <div className="landing-insight-icon">{insight.icon}</div>
                <div>
                  <h3 className="landing-insight-item-title">{insight.title}</h3>
                  <p className="landing-insight-item-description">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>

          <LandingTrackedLink
            href="/onboarding?source=landing"
            className="btn btn-accent btn-large landing-insights-cta"
            ctaName="start_free"
            ctaLocation="insights"
          >
            Start Free
          </LandingTrackedLink>
        </div>
      </div>
    </section>
  );
}
