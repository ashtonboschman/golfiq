'use client';

import posthog from 'posthog-js';
import { getBillingPlatform, isNativeApp, isNativeIOS } from '@/lib/platform';
import type { AnalyticsEventName, AppSurface, AuthProvider, CommonAnalyticsProps, PlanTier } from '@/lib/analytics/events';
import {
  getAnalyticsAppVersion,
  getAnalyticsEnvironment,
  normalizeAuthProvider,
  normalizePlanTier,
} from '@/lib/analytics/events';

type ClientAnalyticsContext = {
  sourcePage?: string;
  pathname?: string;
  user?: {
    id?: string | null;
    subscription_tier?: string | null;
    subscription_status?: string | null;
    subscription_provider?: string | null;
    auth_provider?: string | null;
  } | null;
  isLoggedIn?: boolean;
};

type AnalyticsPerson = NonNullable<ClientAnalyticsContext['user']>;

function detectAppSurface(): AppSurface {
  if (typeof window === 'undefined') return 'web';
  const iOSStandalone = (window.navigator as Navigator & { standalone?: boolean })
    .standalone;
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    iOSStandalone === true;
  return isStandalone ? 'pwa' : 'web';
}

function normalizeSourcePage(rawSource: string | undefined, rawPathname: string | undefined): string {
  if (rawSource && rawSource.trim().length > 0) return rawSource;
  if (rawPathname && rawPathname.trim().length > 0) return rawPathname;
  if (typeof window !== 'undefined' && window.location.pathname) return window.location.pathname;
  return 'unknown';
}

export function buildClientAnalyticsCommonProps(
  context: ClientAnalyticsContext = {},
): CommonAnalyticsProps {
  const sourcePage = normalizeSourcePage(context.sourcePage, context.pathname);
  const planTier: PlanTier = normalizePlanTier(context.user?.subscription_tier);
  const authProvider: AuthProvider = normalizeAuthProvider(
    context.user?.auth_provider,
  );
  const isLoggedIn = context.isLoggedIn ?? Boolean(context.user?.id);
  const nativeApp = isNativeApp();
  const nativeIOS = isNativeIOS();

  return {
    source_page: sourcePage,
    ...(context.user?.subscription_status
      ? { subscription_status: String(context.user.subscription_status) }
      : {}),
    ...(context.user?.subscription_provider
      ? { subscription_provider: String(context.user.subscription_provider) }
      : {}),
    plan_tier: planTier,
    auth_provider: authProvider,
    is_logged_in: isLoggedIn,
    app_surface: detectAppSurface(),
    billing_platform: getBillingPlatform(),
    is_native_app: nativeApp,
    is_native_ios: nativeIOS,
    environment: getAnalyticsEnvironment(),
    app_version: getAnalyticsAppVersion(),
  };
}

export function captureClientEvent(
  event: AnalyticsEventName,
  properties: Record<string, unknown> = {},
  context: ClientAnalyticsContext = {},
): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'test') return;

  try {
    const common = buildClientAnalyticsCommonProps(context);
    posthog.capture(event, { ...common, ...properties });
  } catch {
    // Best-effort only; analytics must never break UI flows.
  }
}

export function buildAnalyticsPersonProperties(
  user: AnalyticsPerson,
): Record<string, string> {
  return {
    plan_tier: normalizePlanTier(user.subscription_tier),
    ...(user.subscription_status ? { subscription_status: user.subscription_status } : {}),
    ...(user.subscription_provider
      ? { subscription_provider: user.subscription_provider }
      : {}),
    auth_provider: normalizeAuthProvider(user.auth_provider),
  };
}

export function identifyClientUser(
  user: AnalyticsPerson | null | undefined,
): void {
  if (!user?.id) return;
  if (process.env.NODE_ENV === 'test') return;

  try {
    posthog.identify(user.id, buildAnalyticsPersonProperties(user));
  } catch {
    // Best-effort only.
  }
}

export function registerClientContext(
  context: ClientAnalyticsContext = {},
): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'test') return;

  try {
    const common = buildClientAnalyticsCommonProps(context);
    posthog.register(common);
  } catch {
    // Best-effort only.
  }
}
