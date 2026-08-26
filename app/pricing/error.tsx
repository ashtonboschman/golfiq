'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function PricingError(props: RouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="purchase"
      operation="pricing_route_render"
      title="Unable to Load Subscription Plans"
      description="GolfIQ couldn’t load subscription options right now. Try again, or return to Settings."
      recoveryHref="/settings"
      recoveryLabel="Return to Settings"
    />
  );
}
