'use client';

import { useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';

export default function OfflinePage() {
  const posthog = usePostHog();

  useEffect(() => {
    posthog.capture('pwa_offline_fallback_shown', {
      online: navigator.onLine,
      path: window.location.pathname,
    });
  }, [posthog]);

  return (
    <section className="card offline-fallback-card">
      <h2>You are offline</h2>
      <p>GolfIQ needs internet to load your rounds and insights.</p>
      <p>Reconnect and try again.</p>
      <div className="offline-fallback-actions">
        <button className="btn btn-accent" type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
        <button className="btn btn-cancel" type="button" onClick={() => (window.location.href = '/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    </section>
  );
}
