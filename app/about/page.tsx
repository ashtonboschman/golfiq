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
          <p>
            Content coming soon...
          </p>
        </section>
      </div>
    </div>
  );
}
