import { BarChart3, Brain, Flag, MapPinned, NotebookPen, Users2 } from 'lucide-react';

export default function Features() {
  const features = [
    {
      icon: <NotebookPen size={28} aria-hidden="true" />,
      title: 'Fast Round Tracking',
      description: 'Log a round after you play, or track your score and the stats you care about hole by hole during a live 9 or 18 hole round.',
    },
    {
      icon: <MapPinned size={28} aria-hidden="true" />,
      title: 'Live GPS and Hole Maps',
      description: 'See mapped hole routes, movable targets, and live front, middle, and back green yardages on supported courses.',
    },
    {
      icon: <Flag size={28} aria-hidden="true" />,
      title: 'My Bag Club Suggestions',
      description: 'Add your carry distances and see which club in your bag best matches the current GPS distance.',
    },
    {
      icon: <Brain size={28} aria-hidden="true" />,
      title: 'Round Insights',
      description: 'See what held up, what cost you strokes, and which part of the round deserves attention next.',
    },
    {
      icon: <BarChart3 size={28} aria-hidden="true" />,
      title: 'Dashboard and Game Trends',
      description: 'Follow scores, handicap, core stats, strokes gained, and longer-term patterns across your rounds.',
    },
    {
      icon: <Users2 size={28} aria-hidden="true" />,
      title: 'Friends and Leaderboards',
      description: 'Connect with golfers you know and compare handicap, average score, and best score across friend and global leaderboards.',
    },
  ];

  return (
    <section id="features" className="landing-features">
      <div className="landing-section-header">
        <h2 className="landing-section-title">Everything You Need to Track, Review, and Understand</h2>
        <p className="landing-section-subtitle">
          GolfIQ keeps live-round tracking simple, then turns the stats you choose to track into a clearer picture of your game.
        </p>
      </div>

      <div className="landing-features-grid">
        {features.map((feature) => (
          <article key={feature.title} className="landing-feature-card">
            <div className="landing-feature-icon">{feature.icon}</div>
            <h3 className="landing-feature-title">{feature.title}</h3>
            <p className="landing-feature-description">{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
