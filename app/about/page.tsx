import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | GolfIQ',
  description: 'Learn about GolfIQ and our mission to help golfers improve through intelligent analytics.',
};

export default function AboutPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">About GolfIQ</h1>

        <section className="legal-section">
          <p className="legal-intro">
            GolfIQ was built to answer a simple question:<br />
            <strong>Why do I shoot the scores I do?</strong>
          </p>

          <p>
            Like many competitive golfers, I tracked my rounds in spreadsheets for years. I wanted clear answers about my game, not cluttered GPS maps, buried stats, or features that got in the way of actually playing golf. Most apps tried to do everything at once. None focused purely on performance, clarity, and improvement.
          </p>

          <p>
            So I built GolfIQ.
          </p>

          <h2 className="legal-subtitle">A Stats First Approach to Improvement</h2>

          <p>
            GolfIQ is a performance-focused golf analytics platform designed for golfers who care about getting better. Instead of relying on GPS or shot-by-shot mapping, GolfIQ uses simple on-course inputs and a smart, non-GPS strokes gained model to calculate real performance data.
          </p>

          <p>
            The result is less time on your phone during a round and more time focused on the next shot. After the round, GolfIQ analyzes your data and turns it into insights that actually matter.
          </p>

          <h2 className="legal-subtitle">Built for Golfers Who Want an Edge</h2>

          <p>
            GolfIQ is for golfers of any skill level who want to understand their game honestly. It naturally resonates most with mid to low handicap players looking for a competitive edge, but anyone curious about their strengths, weaknesses, and trends can benefit.
          </p>

          <p>
            This is not a casual GPS scorecard. GolfIQ is built for players who want to improve through data, pattern recognition, and focused practice.
          </p>

          <h2 className="legal-subtitle">Turning Data Into Coaching Insights</h2>

          <p>
            GolfIQ compares your performance against expectations for your handicap and identifies where you are gaining or losing strokes. That data is then processed through an AI layer that translates your stats into clear, actionable recommendations.
          </p>

          <p>
            You are not just shown numbers. You are shown what they mean, why they matter, and where to focus next.
          </p>

          <p>
            Future updates will introduce an interactive chat experience that allows golfers to ask questions about trends, projections, practice priorities, and long term improvement using their own data.
          </p>

          <h2 className="legal-subtitle">Why No GPS</h2>

          <p>
            GolfIQ intentionally avoids GPS. Many golf apps prioritize maps, distances, and visuals that distract from the game itself. GolfIQ prioritizes clean data and fast input so golfers can stay present during the round.
          </p>

          <p>
            This stats-first philosophy creates better data, better insights, and ultimately better golf.
          </p>

          <h2 className="legal-subtitle">Built in Public</h2>

          <p>
            GolfIQ is currently in beta and actively evolving. New features are being added, refined, and tested with real user feedback. The official public launch is planned for spring.
          </p>

          <p>
            GolfIQ is a solo-founded project and a mix of personal passion and professional engineering. User feedback plays a major role in shaping what comes next.
          </p>

          <h2 className="legal-subtitle">Join the Beta</h2>

          <p>
            If you believe understanding your game is the fastest way to improve it, GolfIQ was built for you.
          </p>

          <p>
            Join the beta to get full premium access, help shape the future of the platform, and be part of the next generation of golf analytics.
          </p>

          <p>
            Follow GolfIQ on social media or join the beta waitlist to stay up to date.
          </p>
        </section>
      </div>
    </div>
  );
}
