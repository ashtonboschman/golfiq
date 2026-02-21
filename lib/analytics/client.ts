'use client';

import posthog from 'posthog-js';
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
    auth_provider?: string | null;
  } | null;
  isLoggedIn?: boolean;
};

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

function buildCommonProps(
  context: ClientAnalyticsContext = {},
): CommonAnalyticsProps {
  const sourcePage = normalizeSourcePage(context.sourcePage, context.pathname);
  const planTier: PlanTier = normalizePlanTier(context.user?.subscription_tier);
  const authProvider: AuthProvider = normalizeAuthProvider(
    context.user?.auth_provider,
  );
  const isLoggedIn = context.isLoggedIn ?? Boolean(context.user?.id);

  return {
    source_page: sourcePage,
    plan_tier: planTier,
    auth_provider: authProvider,
    is_logged_in: isLoggedIn,
    app_surface: detectAppSurface(),
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
    const common = buildCommonProps(context);
    posthog.capture(event, { ...common, ...properties });
  } catch {
    // Best-effort only; analytics must never break UI flows.
  }
}

export function identifyClientUser(
  user: {
    id?: string | null;
    subscription_tier?: string | null;
    auth_provider?: string | null;
    email_verified?: boolean | null;
  } | null | undefined,
  additionalPersonProps: Record<string, unknown> = {},
): void {
  if (!user?.id) return;
  if (process.env.NODE_ENV === 'test') return;

  try {
    posthog.identify(user.id, {
      plan_tier: normalizePlanTier(user.subscription_tier),
      auth_provider: normalizeAuthProvider(user.auth_provider),
      ...(user.email_verified != null
        ? { email_verified: Boolean(user.email_verified) }
        : {}),
      ...additionalPersonProps,
    });
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
    const common = buildCommonProps(context);
    posthog.register(common);
  } catch {
    // Best-effort only.
  }
}

