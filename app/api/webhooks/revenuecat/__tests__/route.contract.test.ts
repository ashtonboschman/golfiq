import { POST } from '@/app/api/webhooks/revenuecat/route';
import { prisma } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscriptionEvent: {
      create: jest.fn(),
    },
    revenueCatWebhookEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  subscriptionEvent: {
    create: jest.Mock;
  };
  revenueCatWebhookEvent: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('/api/webhooks/revenuecat route contract', () => {
  const originalEnv = process.env;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      REVENUECAT_WEBHOOK_SECRET: 'rc_secret_test',
    };

    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionProvider: null,
      subscriptionStartsAt: null,
      subscriptionEndsAt: null,
      subscriptionCancelAtPeriodEnd: false,
      appleOriginalTransactionId: null,
      appleProductId: null,
    });

    mockedPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        revenueCatWebhookEvent: {
          create: mockedPrisma.revenueCatWebhookEvent.create,
        },
        user: {
          update: mockedPrisma.user.update,
        },
        subscriptionEvent: {
          create: mockedPrisma.subscriptionEvent.create,
        },
      })
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('rejects missing auth header', async () => {
    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { id: 'evt_1', type: 'INITIAL_PURCHASE' } }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(401);
  });

  it('rejects invalid auth header', async () => {
    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-secret',
      },
      body: JSON.stringify({ event: { id: 'evt_1', type: 'INITIAL_PURCHASE' } }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(401);
  });

  it('maps Apple purchases to provider apple and activates premium', async () => {
    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer rc_secret_test',
      },
      body: JSON.stringify({
        event: {
          id: 'evt_apple_1',
          type: 'INITIAL_PURCHASE',
          app_user_id: '42',
          product_id: 'golfiq_premium_monthly',
          store: 'APP_STORE',
          environment: 'SANDBOX',
          purchased_at_ms: 1760000000000,
          expiration_at_ms: 1762592000000,
          original_transaction_id: 'orig_tx_123',
        },
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(true);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionProvider: 'apple',
          subscriptionTier: 'premium',
          subscriptionStatus: 'active',
          appleProductId: 'golfiq_premium_monthly',
          appleOriginalTransactionId: 'orig_tx_123',
        }),
      })
    );
  });

  it('maps RevenueCat web billing purchases to provider revenuecat_web', async () => {
    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer rc_secret_test',
      },
      body: JSON.stringify({
        event: {
          id: 'evt_web_1',
          type: 'INITIAL_PURCHASE',
          app_user_id: '42',
          product_id: 'golfiq_web_annual',
          store: 'RC_BILLING',
          environment: 'PRODUCTION',
          purchased_at_ms: 1760000000000,
          expiration_at_ms: 1791536000000,
        },
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionProvider: 'revenuecat_web',
          subscriptionTier: 'premium',
          subscriptionStatus: 'active',
          appleProductId: null,
        }),
      })
    );
  });

  it('marks billing issues as past_due', async () => {
    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer rc_secret_test',
      },
      body: JSON.stringify({
        event: {
          id: 'evt_issue_1',
          type: 'BILLING_ISSUE',
          app_user_id: '42',
          product_id: 'golfiq_web_monthly',
          store: 'RC_BILLING',
          environment: 'PRODUCTION',
        },
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'past_due',
          subscriptionProvider: 'revenuecat_web',
        }),
      })
    );
  });

  it('treats duplicate event IDs as already handled', async () => {
    mockedPrisma.revenueCatWebhookEvent.create.mockRejectedValueOnce({ code: 'P2002' });

    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer rc_secret_test',
      },
      body: JSON.stringify({
        event: {
          id: 'evt_duplicate_1',
          type: 'INITIAL_PURCHASE',
          app_user_id: '42',
          product_id: 'golfiq_web_monthly',
          store: 'RC_BILLING',
          environment: 'PRODUCTION',
        },
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('stores ignored events when user is missing', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.revenueCatWebhookEvent.create.mockResolvedValueOnce({});

    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer rc_secret_test',
      },
      body: JSON.stringify({
        event: {
          id: 'evt_missing_user_1',
          type: 'INITIAL_PURCHASE',
          app_user_id: '999',
          product_id: 'golfiq_web_monthly',
          store: 'RC_BILLING',
          environment: 'PRODUCTION',
        },
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ignored).toBe(true);
    expect(mockedPrisma.revenueCatWebhookEvent.create).toHaveBeenCalled();
  });

  it('ignores unknown products without crashing', async () => {
    mockedPrisma.revenueCatWebhookEvent.create.mockResolvedValueOnce({});

    const request = new Request('http://localhost/api/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer rc_secret_test',
      },
      body: JSON.stringify({
        event: {
          id: 'evt_unknown_product_1',
          type: 'INITIAL_PURCHASE',
          app_user_id: '42',
          product_id: 'unknown_product',
          store: 'RC_BILLING',
          environment: 'PRODUCTION',
        },
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ignored).toBe(true);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });
});
