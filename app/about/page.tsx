import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | GolfIQ',
  description: 'Learn how GolfIQ helps golfers track rounds, understand scores, and spot performance trends over time.',
};

export default function AboutPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">About GolfIQ</h1>

        <section className="legal-section">
          <p className="legal-intro">
            Your scorecard tells you what you shot.<br />
            <strong>GolfIQ helps explain why.</strong>
          </p>

          <p>
            GolfIQ was built for golfers who want fast round tracking, clearer feedback, and a better understanding of what shaped each score. The goal is simple: make it easier to log your golf, spot patterns, and know where to focus next.
          </p>

          <p>
            It started from the same frustration many golfers have. Scores alone do not show the full story, and most apps make it harder than it should be to understand what actually happened during a round.
          </p>

          <h2 className="legal-subtitle">Built Around Real Rounds</h2>

          <p>
            GolfIQ keeps the focus on the round itself. You can log scores and stats without turning your phone into the center of the day, then come back after the round to review what influenced the result.
          </p>

          <p>
            That means less friction while playing and more useful context after the round, whether you are checking score trends, short game performance, or the parts of your game that cost the most strokes.
          </p>

          <h2 className="legal-subtitle">Understand What Shaped Your Score</h2>

          <p>
            GolfIQ is designed to turn round data into practical feedback. Post-round insights, trends, and strokes gained tools help connect the numbers to the story of the round so you can see what is improving and what needs attention.
          </p>

          <p>
            The aim is not to overwhelm you with stats. It is to help you understand your performance more clearly and make smarter practice decisions over time.
          </p>

          <h2 className="legal-subtitle">Focused by Design</h2>

          <p>
            GolfIQ does not try to be everything at once. It is built around tracking rounds, reviewing trends, and helping golfers make sense of their scores without adding extra clutter to the experience.
          </p>

          <p>
            By keeping the product focused, GolfIQ can stay fast to use, easier to trust, and more useful after each round.
          </p>

          <h2 className="legal-subtitle">Built with Golfer Feedback</h2>

          <p>
            GolfIQ is a solo-founded product shaped by real golfers and real rounds. Feedback plays a direct role in what gets refined, simplified, or built next.
          </p>

          <p>
            The product continues to evolve with the goal of giving golfers clearer answers, better tracking, and more confidence in what to work on.
          </p>

          <h2 className="legal-subtitle">Get Started</h2>

          <p>
            If you want to track rounds faster, understand your scores better, and build a clearer picture of your game over time, GolfIQ was built for you.
          </p>

          <p>
            Create a free account to start logging rounds, exploring insights, and following your progress over time.
          </p>

          <p>
            You can share feedback anytime from Settings to help keep GolfIQ useful, focused, and improving with every release.
          </p>
        </section>
      </div>
    </div>
  );
}
