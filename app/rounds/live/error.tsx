'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function LiveRoundError(props: RouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="gps"
      operation="live_round_route_render"
      title="Unable to Load Your Live Round"
      description="Try again to reopen the live round screen, or return to your rounds."
      recoveryHref="/rounds"
      recoveryLabel="Return to Rounds"
    />
  );
}
