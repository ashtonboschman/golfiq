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
            Effective Date: January 2026
          </p>

          <p>
            These Terms of Service ("Terms") govern your use of GolfIQ ("we," "our," or "us"), including our web and mobile applications, websites, and services. By accessing or using GolfIQ, you agree to these Terms.
          </p>

          <p>
            <strong>If you do not agree, do not use GolfIQ.</strong>
          </p>

          <h2 className="legal-subtitle">Eligibility</h2>

          <p>
            You must be at least 13 years old to use GolfIQ. By using the service, you represent and warrant that you meet this requirement.
          </p>

          <h2 className="legal-subtitle">Beta Program</h2>

          <ul>
            <li>GolfIQ is currently in beta. Features may change, be modified, or discontinued without notice.</li>
            <li>Beta services are provided "as-is" and may contain errors or incomplete features.</li>
            <li>You agree to provide feedback to help us improve the product.</li>
            <li>Participation in the beta does not guarantee access to future versions of GolfIQ or its premium features.</li>
          </ul>

          <h2 className="legal-subtitle">Account Registration</h2>

          <ul>
            <li>You must create an account to use certain features.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You agree to provide accurate information and update it as necessary.</li>
          </ul>

          <h2 className="legal-subtitle">Intelligent Insights and Performance Data</h2>

          <ul>
            <li>GolfIQ uses your round data to generate Intelligent Insights and recommendations.</li>
            <li>Insights are based on deterministic statistical models, including strokes-gained calculations, and are provided for informational purposes only.</li>
            <li>GolfIQ is not a substitute for professional instruction or medical advice.</li>
            <li>We do not guarantee specific results from using insights.</li>
          </ul>

          <h2 className="legal-subtitle">User Content</h2>

          <ul>
            <li>You retain ownership of any data or content you input into GolfIQ.</li>
            <li>By using GolfIQ, you grant us a non-exclusive, worldwide, royalty-free license to use your content to operate, maintain, and improve GolfIQ, including insights analytics.</li>
            <li>You agree not to upload content that is illegal, harmful, or infringes on third-party rights.</li>
          </ul>

          <h2 className="legal-subtitle">Prohibited Conduct</h2>

          <p>You agree not to:</p>

          <ul>
            <li>Reverse engineer or interfere with GolfIQ's software</li>
            <li>Use GolfIQ for unlawful purposes</li>
            <li>Attempt to access other users' accounts or data without permission</li>
            <li>Distribute viruses, malware, or harmful code</li>
          </ul>

          <h2 className="legal-subtitle">Payment and Premium Features</h2>

          <ul>
            <li>GolfIQ may offer paid premium features. Beta users may receive temporary access for free.</li>
            <li>All fees are non-refundable unless explicitly stated.</li>
            <li>We reserve the right to modify pricing and subscription plans.</li>
          </ul>

          <h2 className="legal-subtitle">Termination</h2>

          <ul>
            <li>We may suspend or terminate your access to GolfIQ for violations of these Terms.</li>
            <li>You may delete your account at any time.</li>
          </ul>

          <h2 className="legal-subtitle">Disclaimers</h2>

          <ul>
            <li>GolfIQ is provided "as-is" and "as available."</li>
            <li>We make no warranties regarding accuracy, reliability, or fitness for a particular purpose.</li>
            <li>GolfIQ does not guarantee performance improvement.</li>
          </ul>

          <h2 className="legal-subtitle">Limitation of Liability</h2>

          <p>
            To the fullest extent permitted by law, GolfIQ and its affiliates are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the service.
          </p>

          <p>
            This includes damages related to loss of data, performance, or insight recommendations.
          </p>

          <h2 className="legal-subtitle">Indemnification</h2>

          <p>
            You agree to indemnify and hold harmless GolfIQ, its affiliates, and their employees from any claims, damages, or expenses arising from your violation of these Terms.
          </p>

          <h2 className="legal-subtitle">Governing Law</h2>

          <p>
            These Terms are governed by the laws of Canada, without regard to conflict of law principles.
          </p>

          <h2 className="legal-subtitle">Changes to Terms</h2>

          <p>
            We may update these Terms from time to time. Updates will be posted on this page with a new effective date. Continued use of GolfIQ constitutes acceptance of the updated Terms.
          </p>

          <h2 className="legal-subtitle">Contact Us</h2>

          <p>
            If you have questions about these Terms, please contact us:
          </p>

          <p>
            <strong>Email:</strong> <a href="mailto:support@golfiq.ca">support@golfiq.ca</a>
          </p>
        </section>
      </div>
    </div>
  );
}
