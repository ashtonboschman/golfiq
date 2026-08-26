export type MonitoringArea =
  | 'client'
  | 'server'
  | 'webview'
  | 'authentication'
  | 'purchase'
  | 'restore'
  | 'webhook'
  | 'gps'
  | 'save'
  | 'finalization';

export type MonitoringSeverity = 'warning' | 'error' | 'fatal';

export type MonitoringContext = {
  area: MonitoringArea;
  operation: string;
  severity?: MonitoringSeverity;
  route?: string;
  statusCode?: number;
  recoverable?: boolean;
  errorCode?: string;
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#]+)[?#][^\s]*/gi;
const NAMED_COORDINATE_PATTERN = /\b(lat(?:itude)?|lng|lon(?:gitude)?)\s*[:=]\s*-?\d{1,3}(?:\.\d+)?/gi;
const COORDINATE_PAIR_PATTERN = /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g;
const LONG_IDENTIFIER_PATTERN = /\b\d{16,}\b/g;

export function sanitizeMonitoringText(value: string, maxLength = 4_000): string {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(URL_QUERY_PATTERN, '$1')
    .replace(NAMED_COORDINATE_PATTERN, '$1=[redacted-coordinate]')
    .replace(COORDINATE_PAIR_PATTERN, '[redacted-coordinates]')
    .replace(LONG_IDENTIFIER_PATTERN, '[redacted-id]')
    .slice(0, maxLength);
}

export function normalizeMonitoringError(error: unknown): Error {
  if (error instanceof Error) {
    const normalized = new Error(sanitizeMonitoringText(error.message || 'Unknown error'));
    normalized.name = sanitizeMonitoringText(error.name || 'Error', 120);
    if (error.stack) normalized.stack = sanitizeMonitoringText(error.stack, 8_000);
    return normalized;
  }

  if (typeof error === 'string') {
    return new Error(sanitizeMonitoringText(error));
  }

  return new Error('Unknown error');
}

export function buildMonitoringProperties(context: MonitoringContext) {
  return {
    feature_area: context.area,
    operation: context.operation,
    severity: context.severity ?? 'error',
    ...(context.route ? { route: context.route.split('?')[0] } : {}),
    ...(context.statusCode != null ? { status_code: context.statusCode } : {}),
    ...(context.recoverable != null ? { recoverable: context.recoverable } : {}),
    ...(context.errorCode ? { error_code: context.errorCode } : {}),
  };
}
