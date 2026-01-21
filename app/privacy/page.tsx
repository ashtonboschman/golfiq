import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | GolfIQ',
  description: 'GolfIQ Privacy Policy - How we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Privacy Policy</h1>

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
