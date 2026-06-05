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
            Effective Date: June 1, 2026
          </p>

          <p>
            GolfIQ ("we," "our," or "us") helps golfers track rounds and understand performance trends. This policy explains what we collect, how we use it, and your choices.
          </p>

          <h2 className="legal-subtitle">What We Collect</h2>

          <h3 className="legal-subheading">Account and Sign-In Data</h3>
          <ul>
            <li>First name and last name</li>
            <li>Email address</li>
            <li>Account credentials</li>
            <li>If you use email and password sign-in, we store a hashed password</li>
            <li>If you use a third-party sign-in provider, such as Google or Apple when available, we receive account details from that provider</li>
          </ul>

          <h3 className="legal-subheading">Golf and Round Data</h3>
          <ul>
            <li>Courses played and round dates</li>
            <li>Scores, net scores, and handicap-related fields</li>
            <li>Hole-by-hole scores when entered</li>
            <li>FIR, GIR, putts, chips, greenside bunker shots, and penalties</li>
            <li>Directional misses and round context tags such as simulator or practice</li>
            <li>Round insights and trends generated from your submitted round data</li>
          </ul>

          <h3 className="legal-subheading">Profile and Social Data</h3>
          <ul>
            <li>Avatar image, bio, gender, default tee, favorite course</li>
            <li>Friends, friend requests, and related profile visibility settings</li>
            <li>Leaderboard and user detail visibility choices</li>
          </ul>

          <h3 className="legal-subheading">Usage, Device, and Reliability Data</h3>
          <ul>
            <li>Device type, operating system, and browser</li>
            <li>IP address and request metadata used for security and operations</li>
            <li>App usage events and diagnostics</li>
            <li>Analytics events through PostHog to improve activation, retention, reliability, and feature quality</li>
          </ul>

          <h3 className="legal-subheading">Location Data</h3>
          <ul>
            <li>GolfIQ may request location to sort nearby golf courses</li>
            <li>You can deny location access and still search courses by name or city</li>
            <li>Location coordinates are used in course lookup requests and are not sent as raw coordinates in analytics events</li>
          </ul>

          <h3 className="legal-subheading">Billing Data</h3>
          <ul>
            <li>Subscription billing may be processed through RevenueCat and its payment partners, depending on platform and purchase flow</li>
            <li>We store billing-related account status fields needed to provide subscription access</li>
            <li>We do not store full payment card numbers on GolfIQ servers</li>
          </ul>

          <h3 className="legal-subheading">Uploads and Support</h3>
          <ul>
            <li>Avatar image uploads are handled through UploadThing</li>
            <li>Feedback and support messages you send to us</li>
            <li>Internal support notifications sent through our email provider</li>
          </ul>

          <h2 className="legal-subtitle">How We Use Data</h2>
          <p>
            GolfIQ uses this information to provide round tracking, insights, trends, account features, support, and product reliability improvements.
          </p>
          <ul>
            <li>Create and secure your account</li>
            <li>Run course search, scoring, and insights features</li>
            <li>Personalize profile and social experiences</li>
            <li>Process and manage subscriptions</li>
            <li>Respond to support and feedback requests</li>
            <li>Monitor reliability, investigate errors, and prevent abuse</li>
          </ul>

          <h2 className="legal-subtitle">How Data Is Shared</h2>
          <p>We share data only as needed to run GolfIQ.</p>
          <ul>
            <li>Authentication providers for account sign-in</li>
            <li>RevenueCat and payment providers that support billing and subscription management</li>
            <li>PostHog for product analytics</li>
            <li>UploadThing for avatar uploads</li>
            <li>Email providers for account and support communications</li>
            <li>Hosting and infrastructure providers that process app traffic and logs</li>
            <li>Authorities when required by law or valid legal process</li>
          </ul>

          <p>
            We do not sell your personal information.
          </p>

          <h2 className="legal-subtitle">Data Retention</h2>
          <p>
            We retain data for as long as needed to operate GolfIQ and meet legal, security, and billing obligations.
          </p>

          <h2 className="legal-subtitle">Account Deletion</h2>
          <p>
            You can delete your account from Settings in the app. This permanently deletes your GolfIQ account and related in-app data. Some records may be retained by payment processors or in required security and compliance logs.
          </p>

          <h2 className="legal-subtitle">Your Choices</h2>
          <ul>
            <li>Update profile and account information in-app</li>
            <li>Deny optional location access and continue using course search</li>
            <li>Delete your account from Settings</li>
          </ul>

          <h2 className="legal-subtitle">Security</h2>
          <p>
            We use reasonable safeguards to protect your data. No system can be guaranteed 100 percent secure.
          </p>

          <h2 className="legal-subtitle">Children's Privacy</h2>
          <p>
            GolfIQ is not intended for children under 13. We do not knowingly collect personal information from children under 13.
          </p>

          <h2 className="legal-subtitle">Changes to This Privacy Policy</h2>
          <p>
            We may update this policy from time to time. Updates will be posted on this page with a revised effective date.
          </p>

          <h2 className="legal-subtitle">Contact Us</h2>
          <p>
            Questions about privacy or data handling:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:golfiqapp@gmail.com">golfiqapp@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
