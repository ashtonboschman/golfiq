import type { Instrumentation } from 'next';
import { reportServerError } from '@/lib/monitoring/server';

export async function onRequestError(
  error: unknown,
  _request: Parameters<Instrumentation.onRequestError>[1],
  context: Parameters<Instrumentation.onRequestError>[2],
) {
  await reportServerError(error, {
    area: 'server',
    operation: `unhandled_${context.routeType}`,
    route: context.routePath,
    severity: 'fatal',
    recoverable: false,
  });
}
