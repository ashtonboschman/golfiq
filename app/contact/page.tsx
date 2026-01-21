import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | GolfIQ',
  description: 'Get in touch with the GolfIQ team.',
};

export default function ContactPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Contact Us</h1>

        <section className="legal-section">
          <p>
            Content coming soon...
          </p>
        </section>
      </div>
    </div>
  );
}
