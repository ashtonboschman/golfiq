import { POST } from '@/app/api/stripe/checkout/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { createCheckoutSession, createStripeCustomer } from '@/lib/stripe';
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
  },
}));

jest.mock('@/lib/stripe', () => ({
  createCheckoutSession: jest.fn(),
  createStripeCustomer: jest.fn(),
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
};
const mockedCreateCheckoutSession = createCheckoutSession as jest.Mock;
const mockedCreateStripeCustomer = createStripeCustomer as jest.Mock;
const mockedCaptureServerEvent = captureServerEvent as jest.Mock;

describe('/api/stripe/checkout route contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      STRIPE_PRICE_MONTHLY_CAD: 'price_monthly_allowed',
      STRIPE_PRICE_ANNUAL_CAD: 'price_annual_allowed',
      NEXT_PUBLIC_APP_URL: 'https://golfiq.test',
    };

    mockedCaptureServerEvent.mockResolvedValue(undefined);
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: '1',
        email: 'test@example.com',
      },
    });
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(1),
      email: 'test@example.com',
      username: 'tester',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_123',
      profile: {
        firstName: 'Test',
        lastName: 'User',
      },
    });
    mockedCreateCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/cs_test_123',
    });
    mockedCreateStripeCustomer.mockResolvedValue({
      id: 'cus_new',
    });
    mockedPrisma.user.update.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows checkout for a valid monthly priceId', async () => {
    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_monthly_allowed', interval: 'month' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toContain('checkout.stripe.test');
    expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_monthly_allowed',
      }),
    );
  });

  it('allows checkout for a valid annual priceId', async () => {
    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_annual_allowed', interval: 'year' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toContain('checkout.stripe.test');
    expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_annual_allowed',
      }),
    );
  });

  it('returns 400 for a non-allowlisted priceId', async () => {
    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_not_allowed', interval: 'month' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid price');
    expect(mockedCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('blocks active premium users from creating checkout', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(2),
      email: 'premium@example.com',
      username: 'premium-user',
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_999',
      profile: {
        firstName: 'Premium',
        lastName: 'User',
      },
    });

    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_monthly_allowed', interval: 'month' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/already have an active subscription/i);
    expect(mockedCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('allows past_due premium users to create checkout', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(3),
      email: 'pastdue@example.com',
      username: 'past-due-user',
      subscriptionTier: 'premium',
      subscriptionStatus: 'past_due',
      stripeCustomerId: 'cus_555',
      profile: {
        firstName: 'Past',
        lastName: 'Due',
      },
    });

    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_monthly_allowed', interval: 'month' }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(mockedCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('does not treat legacy STRIPE_PREMIUM_* env vars as valid checkout configuration', async () => {
    process.env = {
      ...process.env,
      STRIPE_PRICE_MONTHLY_CAD: '',
      STRIPE_PRICE_ANNUAL_CAD: '',
      STRIPE_PREMIUM_MONTHLY_PRICE_ID: 'price_monthly_allowed',
      STRIPE_PREMIUM_ANNUAL_PRICE_ID: 'price_annual_allowed',
    };

    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_monthly_allowed', interval: 'month' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe('Checkout is not configured');
    expect(mockedCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('does not treat NEXT_PUBLIC_STRIPE_PRICE_* env vars as valid checkout configuration', async () => {
    process.env = {
      ...process.env,
      STRIPE_PRICE_MONTHLY_CAD: '',
      STRIPE_PRICE_ANNUAL_CAD: '',
      NEXT_PUBLIC_STRIPE_PRICE_MONTHLY_CAD: 'price_monthly_allowed',
      NEXT_PUBLIC_STRIPE_PRICE_ANNUAL_CAD: 'price_annual_allowed',
    };

    const request = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_monthly_allowed', interval: 'month' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe('Checkout is not configured');
    expect(mockedCreateCheckoutSession).not.toHaveBeenCalled();
  });
});
