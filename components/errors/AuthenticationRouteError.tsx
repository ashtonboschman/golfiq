'use client';

import RouteErrorFallback, { type RouteErrorProps } from '@/components/errors/RouteErrorFallback';

type AuthenticationRouteErrorProps = RouteErrorProps & {
  operation: string;
};

export default function AuthenticationRouteError({ operation, ...props }: AuthenticationRouteErrorProps) {
  return (
    <RouteErrorFallback
      {...props}
      area="authentication"
      operation={operation}
      title="Unable to Complete Sign In"
      description="GolfIQ couldn’t complete this account step. Try again, or return to the sign-in screen."
      recoveryHref="/login"
      recoveryLabel="Return to Sign In"
    />
  );
}
