/** @jest-environment jsdom */

import { waitForServerPremiumEntitlement } from '@/lib/revenuecat/serverEntitlement';

describe('RevenueCat server entitlement confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns as soon as the webhook-backed subscription becomes active', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tier: 'free', status: 'active' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tier: 'premium', status: 'active' }),
      }) as jest.Mock;

    await expect(waitForServerPremiumEntitlement(2, 0)).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/users/subscription', {
      cache: 'no-store',
    });
  });

  it('returns false after transient failures and free responses are exhausted', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tier: 'free', status: 'active' }),
      }) as jest.Mock;

    await expect(waitForServerPremiumEntitlement(2, 0)).resolves.toBe(false);
  });
});
