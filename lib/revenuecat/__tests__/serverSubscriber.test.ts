import { getRevenueCatApplePremiumSubscription } from '@/lib/revenuecat/serverSubscriber';

const mockedFetch = jest.fn();

describe('RevenueCat server subscriber verification', () => {
  const originalApiKey = process.env.REVENUECAT_SECRET_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REVENUECAT_SECRET_API_KEY = 'secret_rc_key';
    global.fetch = mockedFetch;
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.REVENUECAT_SECRET_API_KEY;
    } else {
      process.env.REVENUECAT_SECRET_API_KEY = originalApiKey;
    }
  });

  it('returns an active Apple Premium subscription from the server response', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        subscriber: {
          entitlements: {
            premium: {
              product_identifier: 'golfiq_premium_monthly',
              purchase_date: '2026-08-25T21:08:24Z',
              expires_date: '2026-08-26T21:08:24Z',
            },
          },
          subscriptions: {
            golfiq_premium_monthly: {
              store: 'app_store',
              original_purchase_date: '2026-08-25T21:08:24Z',
              expires_date: '2026-08-26T21:08:24Z',
              unsubscribe_detected_at: '2026-08-25T22:00:00Z',
            },
          },
        },
      }),
    });

    await expect(getRevenueCatApplePremiumSubscription(
      'user/65',
      new Date('2026-08-25T22:30:00Z'),
    )).resolves.toEqual({
      productId: 'golfiq_premium_monthly',
      startsAt: new Date('2026-08-25T21:08:24Z'),
      endsAt: new Date('2026-08-26T21:08:24Z'),
      cancelAtPeriodEnd: true,
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/user%2F65',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret_rc_key',
        }),
      }),
    );
  });

  it('rejects expired, unknown, and non-Apple entitlements', async () => {
    mockedFetch
      .mockResolvedValueOnce(responseFor('golfiq_premium_monthly', 'app_store', '2026-08-24T21:08:24Z'))
      .mockResolvedValueOnce(responseFor('unknown_product', 'app_store', '2026-08-26T21:08:24Z'))
      .mockResolvedValueOnce(responseFor('golfiq_premium_monthly', 'play_store', '2026-08-26T21:08:24Z'));

    const now = new Date('2026-08-25T22:30:00Z');
    await expect(getRevenueCatApplePremiumSubscription('65', now)).resolves.toBeNull();
    await expect(getRevenueCatApplePremiumSubscription('65', now)).resolves.toBeNull();
    await expect(getRevenueCatApplePremiumSubscription('65', now)).resolves.toBeNull();
  });

  it('fails closed when server verification is unavailable', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(getRevenueCatApplePremiumSubscription('65')).rejects.toThrow(
      'RevenueCat subscription verification failed with status 503.',
    );
  });
});

function responseFor(productId: string, store: string, expiresDate: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      subscriber: {
        entitlements: {
          premium: {
            product_identifier: productId,
            purchase_date: '2026-08-25T21:08:24Z',
            expires_date: expiresDate,
          },
        },
        subscriptions: {
          [productId]: {
            store,
            original_purchase_date: '2026-08-25T21:08:24Z',
            expires_date: expiresDate,
          },
        },
      },
    }),
  };
}
