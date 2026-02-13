import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | GolfIQ',
  description: 'GolfIQ Privacy Policy - How we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">GolfIQ Privacy Policy</h1>

        <section className="legal-section">
          <p className="legal-last-updated">
            Effective Date: January 2026
          </p>

          <p>
            GolfIQ ("we," "our," or "us") respects your privacy and is committed to protecting the personal information you share with us. This Privacy Policy explains how we collect, use, and safeguard your information when you use GolfIQ, including our web app and mobile applications.
          </p>

          <h2 className="legal-subtitle">Information We Collect</h2>

          <h3 className="legal-subheading">Information You Provide</h3>

          <p>We collect information you voluntarily provide to us, including:</p>

          <ul>
            <li>Email address</li>
            <li>Name (optional)</li>
            <li>Handicap (optional)</li>
            <li>Account credentials</li>
            <li>Golf round data and performance statistics</li>
            <li>Feedback, messages, or communications you send to us</li>
          </ul>

          <h3 className="legal-subheading">Information Collected Automatically</h3>

          <p>When you use GolfIQ, we may automatically collect limited technical information, including:</p>

          <ul>
            <li>Device type, operating system, and browser</li>
            <li>IP address and general location data</li>
            <li>Usage activity within the app</li>
            <li>Analytics data to improve app performance and reliability</li>
            <li>Approximate location data to help you sort and display nearby golf courses</li>
          </ul>

          <p>
            <strong>Important:</strong> We do not track your precise location during play, and location data is used only to make course selection easier.
          </p>

          <h2 className="legal-subtitle">How We Use Your Information</h2>

          <p>We use your information to:</p>

          <ul>
            <li>Provide, maintain, and improve GolfIQ features</li>
            <li>Analyze rounds, generate Intelligent Insights, and deliver personalized recommendations</li>
            <li>Communicate with you regarding beta access, updates, promotions, or support</li>
            <li>Monitor app performance and usage trends</li>
            <li>Ensure security and prevent unauthorized activity</li>
          </ul>

          <p>
            <strong>We do not sell your personal information to third parties.</strong>
          </p>

          <h2 className="legal-subtitle">Intelligent Insights Analytics</h2>

          <p>GolfIQ uses your real round data and performance statistics to provide:</p>

          <ul>
            <li>Personalized recommendations and actionable insights</li>
            <li>Trend analysis for strengths and weaknesses</li>
            <li>Strokes gained calculations compared to similar golfers</li>
          </ul>

          <p>
            Your data is processed securely to generate these insights. Recommendations are based on deterministic scoring and strokes-gained models combined with your personal performance data.
          </p>

          <h2 className="legal-subtitle">Data Sharing and Third Parties</h2>

          <p>We may share your information with:</p>

          <ul>
            <li>Service providers that help us deliver GolfIQ features, such as email services</li>
            <li>Vendors for analytics or technical support</li>
            <li>Legal authorities if required by law or to protect rights</li>
          </ul>

          <p>
            All third parties are contractually obligated to handle your data securely and only for the purposes we specify.
          </p>

          <h2 className="legal-subtitle">Data Retention</h2>

          <p>
            We retain your information for as long as necessary to provide GolfIQ services and comply with legal obligations. You can request deletion of your account and data at any time.
          </p>

          <h2 className="legal-subtitle">Your Choices</h2>

          <p>You can:</p>

          <ul>
            <li>Update your account information anytime</li>
            <li>Opt out of promotional emails by following the unsubscribe link</li>
            <li>Delete your GolfIQ account and all associated data</li>
          </ul>

          <p>
            Location access can be turned off on your device, though this may limit course sorting functionality.
          </p>

          <h2 className="legal-subtitle">Security</h2>

          <p>
            We implement reasonable technical and organizational measures to protect your personal information. However, no system is completely secure. We cannot guarantee absolute security of your data.
          </p>

          <h2 className="legal-subtitle">Children's Privacy</h2>

          <p>
            GolfIQ is not intended for children under 13. We do not knowingly collect personal information from children under 13.
          </p>

          <h2 className="legal-subtitle">Changes to This Privacy Policy</h2>

          <p>
            We may update this Privacy Policy from time to time. Updated policies will be posted on this page with a new effective date. We encourage you to review this policy periodically.
          </p>

          <h2 className="legal-subtitle">Contact Us</h2>

          <p>
            If you have questions about this Privacy Policy or how your data is handled, contact us at:
          </p>

          <p>
            <strong>Email:</strong> <a href="mailto:support@golfiq.ca">support@golfiq.ca</a>
          </p>
        </section>
      </div>
    </div>
  );
}
