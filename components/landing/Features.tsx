import { Brain, TrendingUp, Trophy, Users2, BarChart3, MapPin } from 'lucide-react';

export default function Features() {
  const features = [
    {
      icon: <Brain size={32} />,
      title: 'AI-Powered Insights',
      description: 'Get personalized coaching and recommendations based on your performance data. Understand why you shoot the scores you do.',
    },
    {
      icon: <BarChart3 size={32} />,
      title: 'Performance Dashboards',
      description: 'Visualize your progress with beautiful charts, trends, and heatmaps. Track every stat that matters to your game.',
    },
    {
      icon: <Trophy size={32} />,
      title: 'Achievements & Streaks',
      description: 'Stay motivated with gamified achievements, milestone tracking, and streak rewards. Celebrate every improvement.',
    },
    {
      icon: <Users2 size={32} />,
      title: 'Social Leaderboards',
      description: 'Compete with friends and golfers worldwide. Join the community and climb the rankings.',
    },
    {
      icon: <TrendingUp size={32} />,
      title: 'Trend Analysis',
      description: 'Identify patterns in your game with advanced trend forecasting. See where you are improving and where to focus.',
    },
    {
      icon: <MapPin size={32} />,
      title: 'Course-Specific Insights',
      description: 'Get personalized strategies for each course based on your performance history and AI recommendations.',
    },
  ];

  return (
    <section id="features" className="landing-features">
      <div className="landing-section-header">
        <h2 className="landing-section-title">Everything You Need to Improve</h2>
        <p className="landing-section-subtitle">
          Powerful features designed for golfers who are serious about lowering their scores
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
