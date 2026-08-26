'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function AppError(props: RouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="client"
      operation="app_route_render"
      title="Unable to Load This Page"
      description="GolfIQ ran into a problem loading this screen. Try again, or return to your dashboard."
      recoveryHref="/dashboard"
      recoveryLabel="Return to Dashboard"
    />
  );
}
