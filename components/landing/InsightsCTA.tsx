'use client';

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
      description: 'Post-round analysis with personalized feedback generated from your performance trends and strokes-gained data.',
    },
    {
      icon: <Target size={24} />,
      title: 'Weakness Detection',
      description: 'Automatically identify the parts of your game costing you the most strokes so you know exactly where to focus.',
    },
    {
      icon: <LineChart size={24} />,
      title: 'Predictive Analytics',
      description: 'See where your game is headed. Track improvement trends and receive guidance on what will lower your scores fastest.',
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
            GolfIQ goes beyond charts and numbers. Our AI-driven insights explain the real factors behind your scores and guide you toward meaningful improvement.
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
            All beta testers receive full access to premium features at no cost during the beta period.
          </p>
        </div>
      </div>
    </section>
  );
}
