import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | GolfIQ',
  description: 'GolfIQ Terms of Service - Terms and conditions for using our service.',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">GolfIQ Terms of Service</h1>

        <section className="legal-section">
          <p className="legal-last-updated">
            Effective Date: June 1, 2026
          </p>

          <p>
            These Terms of Service ("Terms") apply to your use of GolfIQ, including the web app and progressive web app (PWA). By using GolfIQ, you agree to these Terms.
          </p>

          <h2 className="legal-subtitle">Eligibility</h2>
          <p>
            You must be at least 13 years old to use GolfIQ. By using the service, you represent and warrant that you meet this requirement.
          </p>

          <h2 className="legal-subtitle">Account Registration</h2>
          <ul>
            <li>You are responsible for your account and credentials</li>
            <li>You must provide accurate information and keep it up to date</li>
            <li>You are responsible for activity under your account</li>
          </ul>

          <h2 className="legal-subtitle">Golf Data and Insights</h2>
          <ul>
            <li>GolfIQ uses your submitted round data to generate scoring summaries, trends, and insights</li>
            <li>Insights are informational and improvement-oriented</li>
            <li>GolfIQ does not guarantee lower scores or specific performance outcomes</li>
            <li>GolfIQ is not a substitute for professional coaching, medical advice, legal advice, or financial advice</li>
          </ul>

          <h2 className="legal-subtitle">User Content</h2>
          <ul>
            <li>You retain ownership of data and content you submit</li>
            <li>You grant GolfIQ permission to process that data to operate and improve the service</li>
            <li>You must not upload unlawful content or content that violates third-party rights</li>
          </ul>

          <h2 className="legal-subtitle">Acceptable Use</h2>
          <ul>
            <li>Do not attempt unauthorized access to accounts, systems, or data</li>
            <li>Do not interfere with app operation, security, or availability</li>
            <li>Do not use GolfIQ for illegal, abusive, or fraudulent activity</li>
            <li>Do not upload malware or harmful code</li>
            <li>Do not harass, abuse, impersonate, or threaten other users</li>
            <li>Do not upload offensive, inappropriate, or misleading profile content</li>
          </ul>

          <h2 className="legal-subtitle">Courses and Third-Party Data</h2>
          <ul>
            <li>Course information may come from third-party sources, user submissions, and admin imports</li>
            <li>We cannot guarantee every course record is complete, current, or error-free</li>
          </ul>

          <h2 className="legal-subtitle">Subscriptions and Billing</h2>
          <ul>
            <li>GolfIQ offers free and paid features</li>
            <li>Billing and subscription management may be handled through RevenueCat and its payment partners, depending on platform and purchase flow</li>
            <li>Pricing, feature access, and plan structure may change over time</li>
            <li>Unless required by law, fees are non-refundable</li>
          </ul>

          <h2 className="legal-subtitle">Suspension and Termination</h2>
          <ul>
            <li>We may suspend or terminate accounts that violate these Terms or abuse the service</li>
            <li>You can delete your account from Settings at any time</li>
            <li>We may remove content, restrict social features, or take action on reports of abuse, spam, or inappropriate profile content</li>
          </ul>

          <h2 className="legal-subtitle">Disclaimers</h2>
          <ul>
            <li>GolfIQ is provided "as is" and "as available"</li>
            <li>We do not guarantee uninterrupted service or error-free operation</li>
            <li>We do not guarantee specific golf outcomes from insights or recommendations</li>
          </ul>

          <h2 className="legal-subtitle">Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, GolfIQ is not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
          </p>

          <p>
            GolfIQ's total liability for any claim is limited to the amount you paid to GolfIQ for the service in the 12 months before the claim.
          </p>

          <h2 className="legal-subtitle">Governing Law</h2>
          <p>
            These Terms are governed by the laws of Canada, without regard to conflict of law principles.
          </p>

          <h2 className="legal-subtitle">Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Updates are effective when posted with a revised effective date.
          </p>

          <h2 className="legal-subtitle">Contact Us</h2>
          <p>
            Questions about these Terms:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:golfiqapp@gmail.com">golfiqapp@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
