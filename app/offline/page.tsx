'use client';

import { useRouter } from 'next/navigation';

export default function OfflinePage() {
  const router = useRouter();

  return (
    <section className="card offline-fallback-card">
      <h2>You are offline</h2>
      <p>GolfIQ needs internet to load your rounds and insights.</p>
      <p>Reconnect and try again.</p>
      <div className="offline-fallback-actions">
        <button className="btn btn-accent" type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
        <button className="btn btn-cancel" type="button" onClick={() => router.push('/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    </section>
  );
}
