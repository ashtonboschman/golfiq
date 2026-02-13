import { Brain, TrendingUp, Trophy, Users2, BarChart3, MapPin } from 'lucide-react';

export default function Features() {
  const SHOW_ACHIEVEMENTS_STREAKS = false;

  const features = [
    {
      icon: <Brain size={32} />,
      title: 'Intelligent Insights',
      description: 'Transform real round data into clear, actionable explanations. GolfIQ uses deterministic strokes-gained and trend models to show what is costing strokes and where to focus next.',
    },
    {
      icon: <BarChart3 size={32} />,
      title: 'Performance Dashboards',
      description: 'See your game clearly through interactive dashboards, trends, and detailed breakdowns. Track every stat that matters, from scoring consistency to long-term progress.',
    },
    ...(SHOW_ACHIEVEMENTS_STREAKS
      ? [
          {
            icon: <Trophy size={32} />,
            title: 'Achievements & Streaks',
            description: 'Stay motivated with achievements, streaks, and milestones that reward real progress. Every great round and improvement is recognized.',
          },
        ]
      : []),
    {
      icon: <Users2 size={32} />,
      title: 'Social Leaderboards',
      description: 'Compete with friends and golfers worldwide. Compare performance, track rankings, and stay motivated through friendly competition.',
    },
    {
      icon: <TrendingUp size={32} />,
      title: 'Trend Analysis',
      description: 'Reveal patterns in your game over time. Understand what is improving, what needs attention, and where focused practice will deliver results.',
    },
    {
      icon: <MapPin size={32} />,
      title: 'Course-Specific Insights',
      description: 'Play smarter on every course. GolfIQ highlights how each course impacts your scoring and suggests focus areas based on your performance history.',
    },
  ];

  return (
    <section id="features" className="landing-features">
      <div className="landing-section-header">
        <h2 className="landing-section-title">Everything You Need to Improve</h2>
        <p className="landing-section-subtitle">
          Powerful tools designed for golfers who want clarity, direction, and measurable improvement.
        </p>
      </div>

      <div className="landing-features-grid">
        {features.map((feature, index) => (
          <div key={index} className="landing-feature-card">
            <div className="landing-feature-icon">{feature.icon}</div>
            <h3 className="landing-feature-title">{feature.title}</h3>
            <p className="landing-feature-description">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
