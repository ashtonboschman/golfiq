import { GET } from '@/app/api/users/subscription/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/auth-config', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: jest.fn(),
      list: jest.fn(),
    },
  },
}));

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};
const mockedStripe = stripe as unknown as {
  subscriptions: {
    retrieve: jest.Mock;
    list: jest.Mock;
  };
};

describe('/api/users/subscription route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({
      user: {
        email: 'golfer@example.com',
      },
    });
  });

  it('does not fall back to Stripe sync for revenuecat_web users', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      subscriptionProvider: 'revenuecat_web',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      appleOriginalTransactionId: null,
      appleProductId: null,
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionStartsAt: new Date('2026-06-03T00:00:00.000Z'),
      subscriptionEndsAt: new Date('2026-07-03T00:00:00.000Z'),
      subscriptionCancelAtPeriodEnd: false,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provider).toBe('revenuecat_web');
    expect(mockedStripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(mockedStripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it('still allows legacy Stripe users to reconcile from Stripe', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      subscriptionProvider: 'stripe',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      appleOriginalTransactionId: null,
      appleProductId: null,
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionStartsAt: null,
      subscriptionEndsAt: null,
      subscriptionCancelAtPeriodEnd: false,
    });

    mockedStripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      current_period_start: 1760000000,
      current_period_end: 1762592000,
      cancel_at_period_end: false,
      created: 1760000000,
    });

    mockedPrisma.user.update.mockResolvedValue({
      subscriptionProvider: 'stripe',
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionStartsAt: new Date('2025-10-09T08:53:20.000Z'),
      subscriptionEndsAt: new Date('2025-11-08T08:53:20.000Z'),
      subscriptionCancelAtPeriodEnd: false,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockedStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
  });
});
