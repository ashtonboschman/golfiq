import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | GolfIQ',
  description: 'GolfIQ Terms of Service - Terms and conditions for using our service.',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Terms of Service</h1>

        <section className="legal-section">
          <p className="legal-last-updated">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <p>
            Content coming soon...
          </p>
        </section>
      </div>
    </div>
  );
}
