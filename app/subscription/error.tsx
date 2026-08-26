'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function SubscriptionError(props: RouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="purchase"
      operation="subscription_route_render"
      title="Unable to Load Your Plan Status"
      description="Your purchase may still have completed. Try again, or check your current plan in Settings before purchasing again."
      recoveryHref="/settings"
      recoveryLabel="Check Current Plan"
    />
  );
}
