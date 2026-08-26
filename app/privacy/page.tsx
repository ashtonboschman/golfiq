import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | GolfIQ',
  description: 'GolfIQ Privacy Policy - How we collect, use, and protect your data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">GolfIQ Privacy Policy</h1>

        <section className="legal-section">
          <p className="legal-last-updated">Effective Date: August 26, 2026</p>

          <p>
            GolfIQ (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) helps golfers track rounds and
            understand performance. This Privacy Policy applies to our website,
            progressive web app, and native mobile app and explains what information
            we collect, how we use and share it, how long we keep it, and your choices.
          </p>

          <h2 className="legal-subtitle">Information We Collect</h2>

          <h3 className="legal-subheading">Account and Sign-In Information</h3>
          <ul>
            <li>Name, email address, username, and account settings.</li>
            <li>A securely hashed password when you use email and password sign-in.</li>
            <li>Account identifiers and profile information supplied by Google or Apple when you choose social sign-in.</li>
            <li>Email verification, authentication, security, and session records.</li>
          </ul>

          <h3 className="legal-subheading">Golf and Round Information</h3>
          <ul>
            <li>Courses played, round dates, tees, starting holes, and round type.</li>
            <li>Scores, net scores, handicap fields, and hole-by-hole scores.</li>
            <li>Fairways and greens in regulation, putts, chips, greenside bunker shots, penalties, and directional misses.</li>
            <li>Club names and carry distances saved in My Bag.</li>
            <li>Stats, trends, rankings, forecasts, and insights generated from your golf data.</li>
          </ul>

          <h3 className="legal-subheading">Profile and Social Information</h3>
          <ul>
            <li>Avatar, bio, gender, default tee, favorite course, city, and other profile fields you provide.</li>
            <li>Friends, friend requests, blocks, reports, and related social activity.</li>
            <li>Profile, leaderboard, and user-detail visibility settings.</li>
            <li>Information you make visible to other GolfIQ users through profiles, leaderboards, and social features.</li>
          </ul>

          <h3 className="legal-subheading">Location Information</h3>
          <ul>
            <li>With your permission, GolfIQ uses precise location to find nearby courses and provide Live GPS maps, yardages, and club recommendations.</li>
            <li>During an active Live GPS round on iOS, location updates may continue while GolfIQ is in the background or your screen is locked if you grant the required permission.</li>
            <li>Nearby-course coordinates may be sent to GolfIQ&apos;s course-search service to calculate proximity.</li>
            <li>Live GPS coordinates are processed to operate the current map and are not saved as part of your submitted round or included as raw coordinates in GolfIQ analytics events.</li>
            <li>You may deny or revoke location permission. You can still search for courses manually, but nearby-course and Live GPS features may not work.</li>
          </ul>

          <h3 className="legal-subheading">Subscription and Transaction Information</h3>
          <ul>
            <li>Plan, product, provider, subscription status, purchase and renewal dates, expiration date, cancellation state, and transaction identifiers.</li>
            <li>App Store subscription events and entitlement information supplied by Apple through RevenueCat.</li>
            <li>Web billing and customer identifiers supplied by RevenueCat, Stripe, or their payment partners.</li>
            <li>GolfIQ does not store full payment card numbers or your Apple Account payment credentials.</li>
          </ul>

          <h3 className="legal-subheading">Usage, Device, and Reliability Information</h3>
          <ul>
            <li>Device type, operating system, browser, app version, and app surface.</li>
            <li>IP address, request metadata, security records, and diagnostic information.</li>
            <li>Feature interactions, navigation, purchase-flow events, and reliability events.</li>
            <li>When you are signed in, analytics may be associated with your GolfIQ user ID and account context such as name, email, city, timezone, authentication provider, and subscription state.</li>
          </ul>

          <h3 className="legal-subheading">Uploads and Communications</h3>
          <ul>
            <li>Avatar images and related upload metadata.</li>
            <li>Feedback, reports, and support messages you send us.</li>
            <li>Emails and delivery records for verification, account, billing, and support communications.</li>
          </ul>

          <h2 className="legal-subtitle">How We Collect Information</h2>
          <ul>
            <li>Directly from you when you create an account, enter rounds, edit your profile, configure My Bag, use social features, or contact us.</li>
            <li>Automatically from your browser or device when you use GolfIQ.</li>
            <li>From service providers such as Google, Apple, RevenueCat, and Stripe when you use their sign-in or billing services.</li>
          </ul>

          <h2 className="legal-subtitle">How We Use Information</h2>
          <ul>
            <li>Create, authenticate, secure, and support your account.</li>
            <li>Save rounds and calculate stats, trends, rankings, forecasts, and insights.</li>
            <li>Provide course search, Live GPS, distance, map, and club recommendation features.</li>
            <li>Operate profiles, friends, leaderboards, visibility controls, reports, and blocks.</li>
            <li>Process purchases, restore entitlements, manage subscription access, and maintain transaction records.</li>
            <li>Send service, verification, billing, and support communications.</li>
            <li>Understand product use, improve activation and retention, troubleshoot errors, and develop features.</li>
            <li>Prevent fraud, enforce our Terms, protect users, and comply with legal obligations.</li>
          </ul>

          <h2 className="legal-subtitle">How We Share Information</h2>
          <p>We share information only as needed for the purposes described above, including with:</p>
          <ul>
            <li>Google and Apple for sign-in services you choose.</li>
            <li>Apple, RevenueCat, Stripe, and payment partners for purchases, subscriptions, entitlement management, and account deletion support.</li>
            <li>PostHog for product analytics and reliability measurement.</li>
            <li>Google Maps for map and course-location features.</li>
            <li>UploadThing for avatar uploads.</li>
            <li>Resend and other communications providers for account and support email.</li>
            <li>Vercel, Supabase, and other hosting, database, security, and infrastructure providers.</li>
            <li>Other GolfIQ users when you use social, profile, friend, or leaderboard features, subject to available visibility controls.</li>
            <li>Authorities or other parties when required by law, legal process, or to protect rights, safety, and security.</li>
          </ul>
          <p>
            We do not sell your personal information. Service providers may process
            information only to provide services to GolfIQ. We require service
            providers to protect personal information consistently with this Policy
            and applicable law.
          </p>

          <h2 className="legal-subtitle">International Processing</h2>
          <p>
            GolfIQ and its service providers may process and store information in
            Canada, the United States, and other countries. Information processed in
            another country may be subject to that country&apos;s laws and lawful access
            requests. We use service providers and safeguards appropriate to the
            information and the services they provide.
          </p>

          <h2 className="legal-subtitle">Data Retention and Deletion</h2>
          <ul>
            <li>We retain account and golf information while your account is active and as needed to provide the Service.</li>
            <li>Operational logs, reports, support records, and transaction history are kept only as long as reasonably needed for security, dispute resolution, billing, legal, and compliance purposes.</li>
            <li>You can permanently delete your GolfIQ account and associated in-app data from Settings.</li>
            <li>Deletion does not cancel an App Store subscription. Apple and other providers may retain purchase, payment, or compliance records under their own policies and legal obligations.</li>
            <li>Deleted information may remain temporarily in restricted backups until those backups are overwritten through normal retention cycles.</li>
          </ul>

          <h2 className="legal-subtitle">Your Choices and Privacy Rights</h2>
          <ul>
            <li>Review and update available profile, social visibility, and account settings in GolfIQ.</li>
            <li>Grant, deny, or revoke device permissions such as precise and background location through your device settings.</li>
            <li>Unfriend or block users and report inappropriate users or content.</li>
            <li>Delete your account from Settings.</li>
            <li>Contact us to request access to or correction of your personal information, ask a privacy question, withdraw consent where applicable, or make a privacy complaint.</li>
          </ul>
          <p>
            Some information is required to provide account-based or requested
            features. Withdrawing consent or deleting information may prevent those
            features from working. We may need to verify your identity before
            completing a privacy request.
          </p>

          <h2 className="legal-subtitle">Security</h2>
          <p>
            We use administrative, technical, and organizational safeguards designed
            to protect personal information. No method of storage or transmission is
            completely secure, so we cannot guarantee absolute security.
          </p>

          <h2 className="legal-subtitle">Children&apos;s Privacy</h2>
          <p>
            GolfIQ is not intended for children under 13, and we do not knowingly
            collect personal information from children under 13. Contact us if you
            believe a child under 13 has provided personal information.
          </p>

          <h2 className="legal-subtitle">Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy as GolfIQ or applicable requirements
            change. We will post the revised policy with a new effective date and
            provide additional notice when required by law.
          </p>

          <h2 className="legal-subtitle">Contact Us</h2>
          <p>
            To exercise a privacy right, make a complaint, or ask about this policy,
            email <a href="mailto:golfiqapp@gmail.com">golfiqapp@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
