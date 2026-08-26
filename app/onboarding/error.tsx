'use client';

import AuthenticationRouteError from '@/components/errors/AuthenticationRouteError';
import type { RouteErrorProps } from '@/components/errors/RouteErrorFallback';

export default function OnboardingError(props: RouteErrorProps) {
  return <AuthenticationRouteError {...props} operation="onboarding_route_render" />;
}
