'use client';

import AuthenticationRouteError from '@/components/errors/AuthenticationRouteError';
import type { RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function VerifyEmailError(props: RouteErrorProps) {
  return <AuthenticationRouteError {...props} operation="verify_email_route_render" />;
}
