'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function RoundsError(props: RouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="rounds"
      operation="round_route_render"
      title="Unable to Load This Round"
      description="GolfIQ couldn’t load this round screen. Try again, or return to your rounds."
      recoveryHref="/rounds"
      recoveryLabel="Return to Rounds"
    />
  );
}
