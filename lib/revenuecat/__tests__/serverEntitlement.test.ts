/** @jest-environment jsdom */

import {
  reconcileRevenueCatRestore,
  waitForServerPremiumEntitlement,
} from '@/lib/revenuecat/serverEntitlement';

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

  it('reconciles a restored purchase through the authenticated server endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ restored: true }),
    }) as jest.Mock;

    await expect(reconcileRevenueCatRestore()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/revenuecat/restore', {
      method: 'POST',
      cache: 'no-store',
    });
  });

  it('fails restore reconciliation closed on invalid responses', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('offline')) as jest.Mock;

    await expect(reconcileRevenueCatRestore()).resolves.toBe(false);
    await expect(reconcileRevenueCatRestore()).resolves.toBe(false);
  });
});
