import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | GolfIQ',
  description: 'GolfIQ Terms of Service - Terms and conditions for using our service.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">GolfIQ Terms of Service</h1>

        <section className="legal-section">
          <p className="legal-last-updated">Effective Date: August 26, 2026</p>

          <p>
            These Terms of Service (&quot;Terms&quot;) apply to your use of GolfIQ,
            including our website, progressive web app, and native mobile app
            (collectively, the &quot;Service&quot;). By creating an account or using the
            Service, you agree to these Terms.
          </p>

          <h2 className="legal-subtitle">Eligibility</h2>
          <p>
            You must be at least 13 years old to use GolfIQ. By using the Service,
            you represent that you meet this requirement and are legally able to
            agree to these Terms.
          </p>

          <h2 className="legal-subtitle">Your Account</h2>
          <ul>
            <li>You must provide accurate information and keep it up to date.</li>
            <li>You are responsible for safeguarding your account and credentials.</li>
            <li>You are responsible for activity that occurs through your account.</li>
            <li>You must notify us if you believe your account has been compromised.</li>
          </ul>

          <h2 className="legal-subtitle">Golf Data, Analytics, and Recommendations</h2>
          <ul>
            <li>GolfIQ uses the round and shot data you submit to calculate stats, trends, rankings, handicap outlooks, and other insights.</li>
            <li>Results depend on the accuracy and completeness of the data you enter.</li>
            <li>Insights, forecasts, distances, and club recommendations are informational only and do not guarantee lower scores or any particular outcome.</li>
            <li>GolfIQ is not a substitute for professional coaching, medical advice, legal advice, or financial advice.</li>
          </ul>

          <h2 className="legal-subtitle">GPS and Course Information</h2>
          <ul>
            <li>Live GPS, course maps, yardages, and club recommendations are estimates and may be delayed, unavailable, or inaccurate.</li>
            <li>Course information may come from third-party sources, user submissions, and administrative imports. We do not guarantee that every course record is complete, current, or error-free.</li>
            <li>Always follow posted course markings, local rules, and safety instructions. Do not rely on GolfIQ where an inaccurate location or distance could create a safety risk.</li>
            <li>Keep control of your surroundings and do not use the app in a way that distracts you while driving a cart or operating equipment.</li>
          </ul>

          <h2 className="legal-subtitle">Profile, Social Features, and User Content</h2>
          <ul>
            <li>You retain ownership of the data and content you submit.</li>
            <li>You grant GolfIQ permission to host, process, display, and use that content as needed to operate, secure, and improve the Service.</li>
            <li>Profile details, golf stats, leaderboard results, and social activity may be visible to other users according to the visibility settings and features you use.</li>
            <li>You must have the rights needed to upload any avatar, profile content, or other material you submit.</li>
            <li>You may report inappropriate users or content and block other users through available social controls.</li>
          </ul>

          <h2 className="legal-subtitle">Acceptable Use</h2>
          <p>You must not:</p>
          <ul>
            <li>Attempt unauthorized access to accounts, systems, or data.</li>
            <li>Interfere with the Service&apos;s operation, security, or availability.</li>
            <li>Use GolfIQ for illegal, abusive, deceptive, or fraudulent activity.</li>
            <li>Upload malware, harmful code, unlawful content, or content that violates another person&apos;s rights.</li>
            <li>Harass, threaten, impersonate, or abuse another user.</li>
            <li>Manipulate rounds, rankings, or other data to misrepresent performance or interfere with other users.</li>
          </ul>

          <h2 className="legal-subtitle">Free and Premium Features</h2>
          <p>
            GolfIQ offers a Free plan and optional Premium subscriptions. Features,
            limits, and plan structure may change as the Service evolves. We will
            not remove paid access during a subscription period except where needed
            to address misuse, legal requirements, security, or Service termination.
          </p>

          <h2 className="legal-subtitle">App Store Subscriptions</h2>
          <ul>
            <li>On iOS, Premium is offered as monthly and annual auto-renewable subscriptions through Apple&apos;s In-App Purchase system.</li>
            <li>The price, currency, subscription period, and included trial or offer, if any, shown by Apple before confirmation control your purchase.</li>
            <li>Payment is charged to your Apple Account when you confirm the purchase. Your subscription renews automatically unless you cancel it through your Apple Account subscription settings.</li>
            <li>Cancellation stops future renewals. Unless Apple states otherwise, Premium remains available through the end of the paid subscription period.</li>
            <li>App Store purchases, billing issues, cancellations, and refund requests are administered by Apple under Apple&apos;s applicable terms and policies. GolfIQ cannot directly issue an App Store refund.</li>
            <li>Deleting your GolfIQ account does not cancel an App Store subscription. Cancel the subscription with Apple before deleting your GolfIQ account if you do not want it to renew.</li>
            <li>You may use Restore Purchases to reconnect an eligible App Store purchase to the GolfIQ account currently signed in. A purchase may not be shared across unrelated GolfIQ accounts.</li>
          </ul>

          <h2 className="legal-subtitle">Web Subscriptions</h2>
          <ul>
            <li>Web subscription checkout and management may be provided by RevenueCat, Stripe, and their payment partners.</li>
            <li>The price, renewal terms, and cancellation method shown at checkout control your web purchase.</li>
            <li>Except where required by law or the applicable payment provider&apos;s terms, payments are non-refundable.</li>
          </ul>

          <h2 className="legal-subtitle">Suspension, Termination, and Deletion</h2>
          <ul>
            <li>We may remove content or suspend or terminate accounts that violate these Terms, create risk, or abuse the Service.</li>
            <li>You can permanently delete your GolfIQ account from Settings.</li>
            <li>Account deletion removes your GolfIQ account and associated in-app data as described in our Privacy Policy, but third-party billing or legally required records may remain with the relevant provider.</li>
          </ul>

          <h2 className="legal-subtitle">Third-Party Services</h2>
          <p>
            GolfIQ depends on third-party services for functions such as sign-in,
            maps, analytics, file uploads, hosting, communications, and billing.
            Those services may be governed by their own terms and privacy policies,
            and their availability is outside our control.
          </p>

          <h2 className="legal-subtitle">Disclaimers</h2>
          <ul>
            <li>To the fullest extent permitted by law, GolfIQ is provided &quot;as is&quot; and &quot;as available.&quot;</li>
            <li>We do not guarantee uninterrupted, secure, or error-free operation.</li>
            <li>We do not guarantee the availability or accuracy of third-party services, course data, GPS, insights, or recommendations.</li>
          </ul>

          <h2 className="legal-subtitle">Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, GolfIQ is not liable for
            indirect, incidental, special, consequential, or punitive damages
            arising from your use of the Service.
          </p>
          <p>
            To the fullest extent permitted by law, GolfIQ&apos;s total liability for
            any claim is limited to the amount you paid for the Service in the 12
            months before the claim. Nothing in these Terms limits rights or
            remedies that cannot legally be excluded.
          </p>

          <h2 className="legal-subtitle">Governing Law</h2>
          <p>
            These Terms are governed by the laws of Manitoba and the applicable
            federal laws of Canada, without regard to conflict of law principles.
          </p>

          <h2 className="legal-subtitle">Changes to These Terms</h2>
          <p>
            We may update these Terms as GolfIQ changes. We will post the revised
            Terms with a new effective date and provide additional notice when
            required by law.
          </p>

          <h2 className="legal-subtitle">Contact Us</h2>
          <p>
            Questions about these Terms: <a href="mailto:golfiqapp@gmail.com">golfiqapp@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
