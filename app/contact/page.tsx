import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support | GolfIQ',
  description: 'Contact GolfIQ support for account, billing, and app help.',
};

type ContactPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = (await searchParams) || {};
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  const fromSettings = from === 'settings';
  const privacyHref = fromSettings ? '/privacy?from=settings' : '/privacy';
  const termsHref = fromSettings ? '/terms?from=settings' : '/terms';

  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">GolfIQ Support</h1>

        <section className="legal-section">
          <p>
            Need help with your account, billing, or app experience? We are here to help.
          </p>

          <p>
            <strong>Email:</strong>{' '}
            <a href="mailto:golfiqapp@gmail.com">golfiqapp@gmail.com</a>
          </p>

          <h2 className="legal-subtitle">Account and Access</h2>
          <ul>
            <li>Sign-in or verification issues</li>
            <li>Password reset help</li>
            <li>Round sync or data access questions</li>
          </ul>

          <h2 className="legal-subtitle">Billing and Subscriptions</h2>
          <ul>
            <li>For web subscriptions, use Settings &gt; Manage Subscription to open billing management.</li>
            <li>If billing support is needed, email support and include your account email.</li>
          </ul>

          <h2 className="legal-subtitle">Delete Your Account</h2>
          <p>
            You can delete your account directly in-app:
          </p>
          <ol>
            <li>Sign in to GolfIQ</li>
            <li>Open Settings</li>
            <li>Tap Delete Account and confirm</li>
          </ol>
          <p>
            This permanently removes your GolfIQ account data and cannot be undone.
          </p>
          <p>
            If you cannot access your account, email support and include the email address on the account you want deleted.
          </p>

          <h2 className="legal-subtitle">Safety and Abuse Reports</h2>
          <p>
            To report harassment, spam, inappropriate profile content, or other safety concerns, email support with your account email and any relevant details.
          </p>

          <h2 className="legal-subtitle">Policies</h2>
          <p>
            Review our <Link href={privacyHref}>Privacy Policy</Link> and <Link href={termsHref}>Terms of Service</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
