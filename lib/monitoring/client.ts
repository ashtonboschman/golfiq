'use client';

import posthog from 'posthog-js';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import { isNativeApp } from '@/lib/platform';
import {
  buildMonitoringProperties,
  normalizeMonitoringError,
  type MonitoringContext,
} from '@/lib/monitoring/shared';

export function reportClientError(
  error: unknown,
  context: MonitoringContext,
): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') return;

  const normalized = normalizeMonitoringError(error);
  const properties = {
    ...buildMonitoringProperties(context),
    app_runtime: isNativeApp() ? 'native_webview' : 'browser',
  };

  try {
    posthog.captureException(normalized, properties);
  } catch {
    // Monitoring must never interfere with the user flow.
  }

  captureClientEvent(ANALYTICS_EVENTS.applicationError, properties, {
    pathname: context.route,
  });
}
