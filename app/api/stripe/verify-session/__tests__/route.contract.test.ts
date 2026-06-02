import { POST } from '@/app/api/stripe/verify-session/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { captureServerEvent } from '@/lib/analytics/server';

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
    subscriptionEvent: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: jest.fn(),
      },
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
  },
}));

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn(),
}));

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  subscriptionEvent: {
    create: jest.Mock;
  };
};
const mockedStripe = stripe as unknown as {
  checkout: {
    sessions: {
      retrieve: jest.Mock;
    };
  };
  subscriptions: {
    retrieve: jest.Mock;
  };
};
const mockedCaptureServerEvent = captureServerEvent as jest.Mock;

describe('/api/stripe/verify-session route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCaptureServerEvent.mockResolvedValue(undefined);
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: '42',
        email: 'golfer@example.com',
      },
    });
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      email: 'golfer@example.com',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionStartsAt: null,
      subscriptionEndsAt: null,
    });
    mockedStripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_test_123',
      customer: 'cus_123',
      metadata: {
        userId: '42',
        interval: 'month',
      },
      subscription: 'sub_123',
    });
    mockedStripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      current_period_start: 1760000000,
      current_period_end: 1762592000,
      cancel_at_period_end: false,
    });
    mockedPrisma.user.update.mockResolvedValue({});
    mockedPrisma.subscriptionEvent.create.mockResolvedValue({});
  });

  it('activates Stripe subscriptions with subscriptionProvider set to stripe', async () => {
    const request = new Request('http://localhost/api/stripe/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'cs_test_123' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('activated');
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionProvider: 'stripe',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          subscriptionTier: 'premium',
          subscriptionStatus: 'active',
        }),
      })
    );
  });
});
