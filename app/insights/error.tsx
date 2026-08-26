'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function InsightsError(props: RouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="insights"
      operation="insights_route_render"
      title="Unable to Load Insights"
      description="GolfIQ couldn’t build this Insights screen right now. Try again, or return to your dashboard."
      recoveryHref="/dashboard"
      recoveryLabel="Return to Dashboard"
    />
  );
}
