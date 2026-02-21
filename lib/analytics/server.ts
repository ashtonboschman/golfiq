import type { NextRequest } from 'next/server';
import type { AnalyticsEventName, AppSurface, AuthProvider, CommonAnalyticsProps, PlanTier } from '@/lib/analytics/events';
import {
  getAnalyticsAppVersion,
  getAnalyticsEnvironment,
  normalizeAuthProvider,
  normalizePlanTier,
} from '@/lib/analytics/events';

type ServerAnalyticsContext = {
  request?: NextRequest;
  sourcePage?: string;
  planTier?: string | null;
  authProvider?: string | null;
  isLoggedIn?: boolean;
  appSurface?: AppSurface;
};

type CaptureServerEventArgs = {
  event: AnalyticsEventName;
  distinctId: string;
  properties?: Record<string, unknown>;
  context?: ServerAnalyticsContext;
};

function getApiHost(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    process.env.POSTHOG_HOST ||
    'https://us.i.posthog.com'
  ).replace(/\/+$/, '');
}

function getProjectKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_KEY ||
    process.env.POSTHOG_PROJECT_KEY ||
    null
  );
}

function parseSourceFromHeaders(request?: NextRequest): string | null {
  if (!request) return null;
  const explicit = request.headers.get('x-source-page');
  if (explicit && explicit.trim().length > 0) return explicit;

  const referer = request.headers.get('referer');
  if (!referer) return null;

  try {
    const parsed = new URL(referer);
    return parsed.pathname || null;
  } catch {
    return null;
  }
}

function buildCommonProps(context: ServerAnalyticsContext = {}): CommonAnalyticsProps {
  const sourcePage =
    context.sourcePage ||
    parseSourceFromHeaders(context.request) ||
    context.request?.nextUrl?.pathname ||
    'unknown';
  const planTier: PlanTier = normalizePlanTier(context.planTier);
  const authProvider: AuthProvider = normalizeAuthProvider(context.authProvider);
  const isLoggedIn = context.isLoggedIn ?? true;

  return {
    source_page: sourcePage,
    plan_tier: planTier,
    auth_provider: authProvider,
    is_logged_in: isLoggedIn,
    app_surface: context.appSurface ?? 'web',
    environment: getAnalyticsEnvironment(),
    app_version: getAnalyticsAppVersion(),
  };
}

export async function captureServerEvent({
  event,
  distinctId,
  properties = {},
  context = {},
}: CaptureServerEventArgs): Promise<void> {
  if (!distinctId || distinctId.trim().length === 0) return;
  if (process.env.NODE_ENV === 'test') return;

  const apiKey = getProjectKey();
  if (!apiKey) return;

  const common = buildCommonProps(context);

  try {
    await fetch(`${getApiHost()}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: {
          ...common,
          ...properties,
        },
      }),
    });
  } catch {
    // Best-effort only; analytics must never block request flows.
  }
}

