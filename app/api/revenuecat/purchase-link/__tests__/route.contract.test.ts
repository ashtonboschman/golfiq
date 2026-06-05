import { GET } from '@/app/api/revenuecat/purchase-link/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';

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
    },
  },
}));

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
  };
};

describe('/api/revenuecat/purchase-link route contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      REVENUECAT_WEB_PURCHASE_LINK_BASE_URL: 'https://pay.rev.cat/production-link/',
      REVENUECAT_WEB_PURCHASE_LINK_SANDBOX_URL: 'https://pay.rev.cat/sandbox-link/',
    };

    mockedGetServerSession.mockResolvedValue({
      user: {
        id: '42',
        email: 'player@golfiq.ca',
      },
    });

    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(42),
      email: 'player@golfiq.ca',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionProvider: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
      appleProductId: null,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('redirects unauthenticated users to login', async () => {
    mockedGetServerSession.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/revenuecat/purchase-link?package=monthly');
    const response = await GET(request as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?redirect=/pricing');
  });

  it('redirects invalid package requests back to pricing with an error', async () => {
    const request = new Request('http://localhost/api/revenuecat/purchase-link?package=weekly');
    const response = await GET(request as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/pricing?billing_error=invalid_package');
  });

  it('redirects active premium users to settings instead of reopening checkout', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: BigInt(42),
      email: 'player@golfiq.ca',
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionProvider: 'revenuecat_web',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
      appleProductId: null,
    });

    const request = new Request('http://localhost/api/revenuecat/purchase-link?package=annual');
    const response = await GET(request as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/settings');
  });

  it('uses the sandbox base URL outside production and appends user context', async () => {
    const request = new Request('http://localhost/api/revenuecat/purchase-link?package=monthly');
    const response = await GET(request as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pay.rev.cat/sandbox-link/42?package_id=%24rc_monthly&email=player%40golfiq.ca',
    );
  });

  it('uses the production base URL on production deployments', async () => {
    process.env = {
      ...process.env,
      VERCEL_ENV: 'production',
    };

    const request = new Request('http://localhost/api/revenuecat/purchase-link?package=annual');
    const response = await GET(request as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pay.rev.cat/production-link/42?package_id=%24rc_annual&email=player%40golfiq.ca',
    );
  });
});
