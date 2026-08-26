import {
  buildMonitoringProperties,
  normalizeMonitoringError,
  sanitizeMonitoringPayload,
  sanitizeMonitoringText,
} from '@/lib/monitoring/shared';

describe('monitoring privacy helpers', () => {
  it('redacts personal and sensitive values from error text', () => {
    const sanitized = sanitizeMonitoringText(
      'user golfer@example.com failed at lat=49.9719 lng=-98.2902 with Bearer abc.def.ghi transaction 2000001226904323 https://example.com/path?token=secret',
    );

    expect(sanitized).not.toContain('golfer@example.com');
    expect(sanitized).not.toContain('49.9719');
    expect(sanitized).not.toContain('-98.2902');
    expect(sanitized).not.toContain('abc.def.ghi');
    expect(sanitized).not.toContain('2000001226904323');
    expect(sanitized).not.toContain('token=secret');
    expect(sanitized).toContain('[redacted-email]');
    expect(sanitized).toContain('[redacted-id]');
  });

  it('sanitizes both the message and stack of Error instances', () => {
    const error = new Error('Purchase failed for golfer@example.com at 49.9719, -98.2902');
    error.stack = `Error: ${error.message}\n at checkout (purchase.ts:10:2)`;

    const normalized = normalizeMonitoringError(error);

    expect(normalized.message).not.toContain('golfer@example.com');
    expect(normalized.message).not.toContain('49.9719');
    expect(normalized.stack).not.toContain('golfer@example.com');
    expect(normalized.stack).toContain('purchase.ts:10:2');
  });

  it('keeps monitoring properties allowlisted and strips query strings', () => {
    expect(buildMonitoringProperties({
      area: 'gps',
      operation: 'load_live_map',
      route: '/rounds/live/abc?lat=49.9719&lng=-98.2902',
      statusCode: 500,
      recoverable: true,
    })).toEqual({
      feature_area: 'gps',
      operation: 'load_live_map',
      severity: 'error',
      route: '/rounds/live/abc',
      status_code: 500,
      recoverable: true,
    });
  });

  it('removes inherited personal data from PostHog monitoring payloads', () => {
    const sanitized = sanitizeMonitoringPayload({
      event: 'application_error',
      properties: {
        feature_area: 'client',
        operation: 'unhandled_error',
        user_email: 'golfer@example.com',
        user_first_name: 'Test',
        user_last_name: 'Golfer',
        user_timezone: 'America/Winnipeg',
        $current_url: 'https://www.golfiq.ca/dashboard?token=secret',
        nested: {
          latitude: 49.9719,
          message: 'Failed for golfer@example.com at -98.2902, 49.9719',
        },
      },
    });

    expect(sanitized).toEqual({
      event: 'application_error',
      properties: {
        feature_area: 'client',
        operation: 'unhandled_error',
        $current_url: 'https://www.golfiq.ca/dashboard',
        nested: {
          message: 'Failed for [redacted-email] at [redacted-coordinates]',
        },
      },
    });
  });
});
