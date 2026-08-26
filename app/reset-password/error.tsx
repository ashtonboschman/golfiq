'use client';

import AuthenticationRouteError from '@/components/errors/AuthenticationRouteError';
import type { RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function ResetPasswordError(props: RouteErrorProps) {
  return <AuthenticationRouteError {...props} operation="reset_password_route_render" />;
}
