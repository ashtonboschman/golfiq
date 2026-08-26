import { DELETE } from '@/app/api/users/account/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { cancelSubscriptionImmediately, stripe } from '@/lib/stripe';
import { deleteRevenueCatCustomer } from '@/lib/revenuecat/serverCustomer';
import { revokeAppleRefreshToken } from '@/lib/auth/appleTokenLifecycle';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/stripe', () => ({
  cancelSubscriptionImmediately: jest.fn(),
  stripe: {
    subscriptions: {
      list: jest.fn(),
      retrieve: jest.fn(),
    },
  },
}));

jest.mock('@/lib/revenuecat/serverCustomer', () => ({
  deleteRevenueCatCustomer: jest.fn(),
}));

jest.mock('@/lib/auth/appleTokenLifecycle', () => ({
  revokeAppleRefreshToken: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
};
const mockedStripe = stripe as unknown as {
  subscriptions: {
    list: jest.Mock;
    retrieve: jest.Mock;
  };
};
const mockedCancelSubscriptionImmediately = cancelSubscriptionImmediately as jest.Mock;
const mockedDeleteRevenueCatCustomer = deleteRevenueCatCustomer as jest.Mock;
const mockedRevokeAppleRefreshToken = revokeAppleRefreshToken as jest.Mock;

function request(): Request {
  return new Request('http://localhost/api/users/account', { method: 'DELETE' });
}

describe('/api/users/account DELETE contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(42));
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      oauthAccounts: [],
    });
    mockedRevokeAppleRefreshToken.mockResolvedValue(undefined);
    mockedDeleteRevenueCatCustomer.mockResolvedValue(undefined);
    mockedPrisma.user.delete.mockResolvedValue({ id: BigInt(42) });
  });

  it('removes the RevenueCat customer before deleting the local account', async () => {
    const response = await DELETE(request() as any);

    expect(response.status).toBe(200);
    expect(mockedDeleteRevenueCatCustomer).toHaveBeenCalledWith('42');
    expect(mockedPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: BigInt(42) },
    });
    expect(mockedDeleteRevenueCatCustomer.mock.invocationCallOrder[0]).toBeLessThan(
      mockedPrisma.user.delete.mock.invocationCallOrder[0],
    );
  });

  it('cancels active Stripe subscriptions before external and local deletion', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      stripeCustomerId: 'cus_42',
      stripeSubscriptionId: 'sub_saved',
      oauthAccounts: [],
    });
    mockedStripe.subscriptions.list.mockResolvedValue({
      data: [
        { id: 'sub_listed', status: 'active' },
        { id: 'sub_ended', status: 'canceled' },
      ],
    });
    mockedStripe.subscriptions.retrieve.mockImplementation(async (id: string) => ({
      id,
      status: 'active',
    }));

    const response = await DELETE(request() as any);

    expect(response.status).toBe(200);
    expect(mockedCancelSubscriptionImmediately).toHaveBeenCalledTimes(2);
    expect(mockedCancelSubscriptionImmediately).toHaveBeenCalledWith('sub_saved');
    expect(mockedCancelSubscriptionImmediately).toHaveBeenCalledWith('sub_listed');
    expect(mockedCancelSubscriptionImmediately.mock.invocationCallOrder[1]).toBeLessThan(
      mockedDeleteRevenueCatCustomer.mock.invocationCallOrder[0],
    );
  });

  it('revokes a stored Sign in with Apple token before deleting external and local data', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      oauthAccounts: [{
        refreshTokenEncrypted: 'encrypted-token',
        refreshTokenClientId: 'ca.golfiq.app',
      }],
    });

    const response = await DELETE(request() as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.manualAppleRevocationRequired).toBe(false);
    expect(mockedRevokeAppleRefreshToken).toHaveBeenCalledWith({
      encryptedRefreshToken: 'encrypted-token',
      clientId: 'ca.golfiq.app',
    });
    expect(mockedRevokeAppleRefreshToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockedDeleteRevenueCatCustomer.mock.invocationCallOrder[0],
    );
  });

  it('deletes a legacy Apple account and requests manual authorization removal', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      oauthAccounts: [{
        refreshTokenEncrypted: null,
        refreshTokenClientId: null,
      }],
    });

    const response = await DELETE(request() as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.manualAppleRevocationRequired).toBe(true);
    expect(mockedRevokeAppleRefreshToken).not.toHaveBeenCalled();
    expect(mockedPrisma.user.delete).toHaveBeenCalled();
  });

  it('does not delete account data when Apple authorization revocation fails', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      oauthAccounts: [{
        refreshTokenEncrypted: 'encrypted-token',
        refreshTokenClientId: 'ca.golfiq.app',
      }],
    });
    mockedRevokeAppleRefreshToken.mockRejectedValue(new Error('Apple unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await DELETE(request() as any);

    expect(response.status).toBe(500);
    expect(mockedDeleteRevenueCatCustomer).not.toHaveBeenCalled();
    expect(mockedPrisma.user.delete).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not delete the local account when RevenueCat cleanup fails', async () => {
    mockedDeleteRevenueCatCustomer.mockRejectedValue(new Error('RevenueCat unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await DELETE(request() as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe('Failed to delete account. Please try again.');
    expect(mockedPrisma.user.delete).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not delete external or local customer data when Stripe cancellation fails', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      stripeCustomerId: null,
      stripeSubscriptionId: 'sub_42',
      oauthAccounts: [],
    });
    mockedStripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_42',
      status: 'active',
    });
    mockedCancelSubscriptionImmediately.mockRejectedValue(new Error('Stripe unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await DELETE(request() as any);

    expect(response.status).toBe(500);
    expect(mockedDeleteRevenueCatCustomer).not.toHaveBeenCalled();
    expect(mockedPrisma.user.delete).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns unauthorized without looking up or deleting account data', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const response = await DELETE(request() as any);

    expect(response.status).toBe(401);
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockedDeleteRevenueCatCustomer).not.toHaveBeenCalled();
    expect(mockedPrisma.user.delete).not.toHaveBeenCalled();
  });
});
