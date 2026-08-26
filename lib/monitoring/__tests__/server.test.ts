import { captureServerEvent } from '@/lib/analytics/server';
import { reportServerError } from '@/lib/monitoring/server';

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockedCaptureServerEvent = captureServerEvent as jest.Mock;

describe('reportServerError', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    mockedCaptureServerEvent.mockClear();
    consoleError.mockClear();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  it('writes a structured log and a privacy-safe PostHog event', async () => {
    await reportServerError(
      new Error('Restore failed for golfer@example.com at lat=49.9719'),
      {
        area: 'restore',
        operation: 'reconcile_revenuecat_restore',
        route: '/api/revenuecat/restore?email=golfer@example.com',
        statusCode: 502,
        recoverable: true,
      },
    );

    expect(consoleError).toHaveBeenCalledTimes(1);
    const log = JSON.parse(consoleError.mock.calls[0][0]);
    expect(log).toMatchObject({
      level: 'error',
      event: 'application_error',
      feature_area: 'restore',
      operation: 'reconcile_revenuecat_restore',
      route: '/api/revenuecat/restore',
      status_code: 502,
      recoverable: true,
    });
    expect(JSON.stringify(log)).not.toContain('golfer@example.com');
    expect(JSON.stringify(log)).not.toContain('49.9719');

    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'application_error',
      distinctId: 'system:restore',
      properties: expect.objectContaining({
        feature_area: 'restore',
        operation: 'reconcile_revenuecat_restore',
      }),
    }));
  });
});
