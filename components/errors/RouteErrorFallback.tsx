'use client';

import { useEffect, useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import { reportClientError } from '@/lib/monitoring/client';
import type { MonitoringArea } from '@/lib/monitoring/shared';

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

type RouteErrorFallbackProps = RouteErrorProps & {
  area: MonitoringArea;
  operation: string;
  title: string;
  description: string;
  recoveryHref: string;
  recoveryLabel: string;
  standalone?: boolean;
};

export default function RouteErrorFallback({
  error,
  reset,
  area,
  operation,
  title,
  description,
  recoveryHref,
  recoveryLabel,
  standalone = false,
}: RouteErrorFallbackProps) {
  const titleId = useId();

  useEffect(() => {
    reportClientError(error, {
      area,
      operation,
      route: window.location.pathname,
      recoverable: true,
    });
  }, [area, error, operation]);

  return (
    <section
      className={`app-error-boundary${standalone ? ' app-error-boundary-standalone' : ''}`}
      role="alert"
      aria-labelledby={titleId}
    >
      <div className="card app-error-card">
        <TriangleAlert className="app-error-icon" aria-hidden="true" />
        <div className="app-error-copy">
          <h1 id={titleId}>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="app-error-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try Again
          </button>
          <a className="btn btn-secondary" href={recoveryHref}>
            {recoveryLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
