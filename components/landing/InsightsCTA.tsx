import Image from 'next/image';
import { Sparkles, Target, LineChart } from 'lucide-react';

export default function InsightsCTA() {
  const scrollToWaitlist = () => {
    const element = document.getElementById('waitlist');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const insights = [
    {
      icon: <Sparkles size={24} />,
      title: 'AI Coaching',
      description: 'Post-round analysis with personalized tips based on your performance patterns',
    },
    {
      icon: <Target size={24} />,
      title: 'Weakness Detection',
      description: 'Automatically identify and track areas that need the most improvement',
    },
    {
      icon: <LineChart size={24} />,
      title: 'Predictive Analytics',
      description: 'Forecast your handicap trajectory and get recommended practice focus areas',
    },
  ];

  return (
    <section id="insights" className="card landing-insights">
      <div className="landing-insights-content">
        <div className="landing-insights-text">
          <span className="landing-premium-badge">Premium Feature</span>
          <h2 className="landing-insights-title">
            Understand <span className="accent-text">Why</span> You Shoot the Scores You Do
          </h2>
          <p className="landing-insights-subtitle">
            GolfIQ's AI doesn't just show you numbers—it tells you exactly what's holding you back
            and how to fix it. Get insights that feel like having a personal coach in your pocket.
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

          <button onClick={scrollToWaitlist} className="btn btn-accent btn-large">
            Get Premium Access in Beta
          </button>
          <p className="landing-insights-note">
            All beta testers get full premium features for free
          </p>
        </div>
      </div>
    </section>
  );
}
