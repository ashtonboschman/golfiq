'use client';

import AuthenticationRouteError from '@/components/errors/AuthenticationRouteError';
import type { RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function ForgotPasswordError(props: RouteErrorProps) {
  return <AuthenticationRouteError {...props} operation="forgot_password_route_render" />;
}
