/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import UpgradeModal from '@/components/UpgradeModal';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;

describe('UpgradeModal analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '42',
          subscription_tier: 'free',
          auth_provider: 'password',
        },
      },
    });
  });

  it('tracks a paywall dismissal separately from checkout failures', () => {
    const onClose = jest.fn();

    render(
      <UpgradeModal
        isOpen
        onClose={onClose}
        title="See the Full Breakdown"
        message="Premium gives you a clearer look at your game."
        ctaLocation="round_insights"
        paywallContext="post_round"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.paywallDismissed,
      expect.objectContaining({
        dismiss_source: 'button',
        cta_location: 'round_insights',
        paywall_context: 'post_round',
      }),
      expect.any(Object),
    );
    expect(mockedCaptureClientEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.checkoutFailed,
      expect.anything(),
      expect.anything(),
    );
  });
});
