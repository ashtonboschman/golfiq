import { Brain, TrendingUp, Trophy, Users2, BarChart3 } from 'lucide-react';

export default function Features() {
  const SHOW_ACHIEVEMENTS_STREAKS = false;

  const features = [
    {
      icon: <Brain size={32} />,
      title: 'Round Insights',
      description: 'See what cost you strokes, what held up, and what deserves your attention next time out.',
    },
    {
      icon: <BarChart3 size={32} />,
      title: 'Game Dashboard',
      description: 'Keep your score trends, core stats, and round history in one place.',
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
      description: 'Play with friends, compare scores, and keep the competitive side of the game fun.',
    },
    {
      icon: <TrendingUp size={32} />,
      title: 'Score Trends',
      description: 'See whether your scores are settling down, moving the right way, or getting away from you.',
    },
  ];

  return (
    <section id="features" className="landing-features">
      <div className="landing-section-header">
        <h2 className="landing-section-title">Built for the Round After the Round</h2>
        <p className="landing-section-subtitle">
          Clear tools for golfers who want honest answers, better habits, and a smarter next round.
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
