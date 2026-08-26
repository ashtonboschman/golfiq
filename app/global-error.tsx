'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function GlobalError(props: RouteErrorProps) {
  return (
    <html lang="en" className="theme-dark">
      <body>
        <RouteErrorFallback
          {...props}
          area="client"
          operation="root_layout_render"
          title="GolfIQ Couldn’t Start"
          description="Try again to restart the app. If the problem continues, return to the GolfIQ home page."
          recoveryHref="/"
          recoveryLabel="Return to GolfIQ"
          standalone
        />
      </body>
    </html>
  );
}
