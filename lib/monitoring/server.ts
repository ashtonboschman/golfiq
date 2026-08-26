import type { NextRequest } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import {
  buildMonitoringProperties,
  normalizeMonitoringError,
  type MonitoringContext,
} from '@/lib/monitoring/shared';

type ServerMonitoringContext = MonitoringContext & {
  request?: NextRequest;
};

export async function reportServerError(
  error: unknown,
  context: ServerMonitoringContext,
): Promise<void> {
  const normalized = normalizeMonitoringError(error);
  const requestId =
    context.request?.headers.get('x-vercel-id') ||
    context.request?.headers.get('x-request-id') ||
    undefined;
  const properties = {
    ...buildMonitoringProperties(context),
    error_name: normalized.name,
    error_message: normalized.message,
    ...(requestId ? { request_id: requestId } : {}),
  };

  console.error(JSON.stringify({
    level: context.severity ?? 'error',
    event: ANALYTICS_EVENTS.applicationError,
    ...properties,
    ...(normalized.stack ? { stack: normalized.stack } : {}),
  }));

  await captureServerEvent({
    event: ANALYTICS_EVENTS.applicationError,
    distinctId: `system:${context.area}`,
    properties,
    context: {
      request: context.request,
      sourcePage: context.route,
      isLoggedIn: false,
    },
  });
}
