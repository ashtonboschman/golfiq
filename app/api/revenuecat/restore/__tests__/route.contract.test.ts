import { POST } from '@/app/api/revenuecat/restore/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getRevenueCatApplePremiumSubscription } from '@/lib/revenuecat/serverSubscriber';

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/revenuecat/serverSubscriber', () => ({
  getRevenueCatApplePremiumSubscription: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedGetSubscription = getRevenueCatApplePremiumSubscription as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const tx = {
  user: { update: jest.fn() },
  subscriptionEvent: { create: jest.fn() },
};

function request(): Request {
  return new Request('http://localhost/api/revenuecat/restore', { method: 'POST' });
}

describe('/api/revenuecat/restore POST contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(65));
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(65),
      subscriptionTier: 'free',
      subscriptionStatus: 'cancelled',
    });
    mockedPrisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mockedGetSubscription.mockResolvedValue({
      productId: 'golfiq_premium_monthly',
      startsAt: new Date('2026-08-25T21:08:24Z'),
      endsAt: new Date('2026-08-26T21:08:24Z'),
      cancelAtPeriodEnd: false,
    });
  });

  it('repairs the authenticated user from RevenueCat server data', async () => {
    const response = await POST(request() as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      restored: true,
      tier: 'premium',
      status: 'active',
      provider: 'apple',
    });
    expect(mockedGetSubscription).toHaveBeenCalledWith('65');
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: BigInt(65) },
      data: {
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        subscriptionProvider: 'apple',
        subscriptionStartsAt: new Date('2026-08-25T21:08:24Z'),
        subscriptionEndsAt: new Date('2026-08-26T21:08:24Z'),
        subscriptionCancelAtPeriodEnd: false,
        appleProductId: 'golfiq_premium_monthly',
      },
    });
    expect(tx.subscriptionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: BigInt(65),
        eventType: 'revenuecat_restore_sync',
        oldTier: 'free',
        newTier: 'premium',
      }),
    });
  });

  it('does not overwrite lifetime access', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(65),
      subscriptionTier: 'lifetime',
      subscriptionStatus: 'active',
    });

    const response = await POST(request() as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ restored: true, tier: 'lifetime' });
    expect(mockedGetSubscription).not.toHaveBeenCalled();
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not grant Premium when RevenueCat has no active Apple entitlement', async () => {
    mockedGetSubscription.mockResolvedValue(null);

    const response = await POST(request() as any);

    expect(response.status).toBe(409);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated restore reconciliation', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const response = await POST(request() as any);

    expect(response.status).toBe(401);
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockedGetSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when RevenueCat verification fails', async () => {
    mockedGetSubscription.mockRejectedValue(new Error('RevenueCat unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(request() as any);

    expect(response.status).toBe(502);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
