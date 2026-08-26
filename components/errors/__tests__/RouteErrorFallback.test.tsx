/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RouteErrorFallback from '@/components/errors/RouteErrorFallback';
import LiveRoundError from '@/app/rounds/live/error';
import SubscriptionError from '@/app/subscription/error';
import LoginError from '@/app/login/error';
import InsightsError from '@/app/insights/error';
import { reportClientError } from '@/lib/monitoring/client';

jest.mock('@/lib/monitoring/client', () => ({
  reportClientError: jest.fn(),
}));

const mockedReportClientError = jest.mocked(reportClientError);

describe('RouteErrorFallback', () => {
  beforeEach(() => {
    mockedReportClientError.mockClear();
    window.history.replaceState({}, '', '/rounds/live/session-1?source=test');
  });

  it('offers retry and safe navigation without exposing the underlying error', async () => {
    const reset = jest.fn();
    const error = new Error('Private provider failure details');

    render(
      <RouteErrorFallback
        error={error}
        reset={reset}
        area="gps"
        operation="live_round_route_render"
        title="Unable to Load Your Live Round"
        description="Try again or return to your rounds."
        recoveryHref="/rounds"
        recoveryLabel="Return to Rounds"
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(error.message)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Rounds' })).toHaveAttribute('href', '/rounds');

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(reset).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockedReportClientError).toHaveBeenCalledWith(error, {
        area: 'gps',
        operation: 'live_round_route_render',
        route: '/rounds/live/session-1',
        recoverable: true,
      });
    });
  });

  it.each([
    [LiveRoundError, 'Unable to Load Your Live Round', 'gps', 'live_round_route_render'],
    [SubscriptionError, 'Unable to Load Your Plan Status', 'purchase', 'subscription_route_render'],
    [LoginError, 'Unable to Complete Sign In', 'authentication', 'login_route_render'],
    [InsightsError, 'Unable to Load Insights', 'insights', 'insights_route_render'],
  ] as const)('uses targeted recovery and monitoring for %s', async (Boundary, title, area, operation) => {
    const error = new Error('route failed');
    const view = render(<Boundary error={error} reset={jest.fn()} />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedReportClientError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ area, operation, recoverable: true }),
      );
    });

    view.unmount();
    mockedReportClientError.mockClear();
  });
});
