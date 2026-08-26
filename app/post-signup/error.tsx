'use client';

import AuthenticationRouteError from '@/components/errors/AuthenticationRouteError';
import type { RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function PostSignupError(props: RouteErrorProps) {
  return <AuthenticationRouteError {...props} operation="post_signup_route_render" />;
}
