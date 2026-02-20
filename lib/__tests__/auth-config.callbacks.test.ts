import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';

describe('authOptions callbacks', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores theme and subscription tier on JWT token', async () => {
    const jwt = authOptions.callbacks?.jwt;
    expect(jwt).toBeDefined();

    const token = await jwt!(
      {
        token: {},
        user: {
          id: '42',
          email: 'test@example.com',
          name: 'Test User',
          theme: 'twilight',
          subscription_tier: 'premium',
        } as any,
      } as any,
    );

    expect(token.id).toBe('42');
    expect(token.email).toBe('test@example.com');
    expect(token.name).toBe('Test User');
    expect(token.theme).toBe('twilight');
    expect(token.subscription_tier).toBe('premium');
  });

  it('hydrates session.user with token theme and subscription tier', async () => {
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();

    const session = await sessionCallback!(
      {
        session: {
          user: {
            name: null,
            email: null,
            image: null,
          },
          expires: new Date(Date.now() + 60_000).toISOString(),
        },
        token: {
          id: '7',
          email: 'golfer@example.com',
          name: 'Golfer',
          theme: 'oceanic',
          subscription_tier: 'lifetime',
        },
      } as any,
    );

    const user = session.user as {
      id?: string;
      email?: string | null;
      name?: string | null;
      theme?: string;
      subscription_tier?: string;
    };

    expect(user.id).toBe('7');
    expect(user.email).toBe('golfer@example.com');
    expect(user.name).toBe('Golfer');
    expect(user.theme).toBe('oceanic');
    expect(user.subscription_tier).toBe('lifetime');
  });

  it('links google sign-in to an existing same-email account', async () => {
    const signIn = authOptions.callbacks?.signIn;
    expect(signIn).toBeDefined();

    const existingUser = {
      id: BigInt(7),
      email: 'golfer@example.com',
      username: 'golfer',
      passwordHash: 'hash',
      active: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionEndsAt: null,
      subscriptionStartsAt: null,
      subscriptionStatus: 'active',
      subscriptionCancelAtPeriodEnd: false,
      subscriptionTier: 'free',
      profile: {
        id: BigInt(1),
        userId: BigInt(7),
        firstName: 'Golf',
        lastName: 'Er',
        avatarUrl: '/avatars/default.png',
        bio: null,
        gender: 'unspecified',
        defaultTee: 'white',
        favoriteCourseId: null,
        dashboardVisibility: 'friends',
        createdAt: new Date(),
        updatedAt: new Date(),
        theme: 'dark',
        timezone: null,
        showStrokesGained: true,
      },
    };

    jest.spyOn(prisma.oAuthAccount, 'findUnique').mockResolvedValueOnce(null as any);
    jest.spyOn(prisma.user, 'findUnique')
      .mockResolvedValueOnce(existingUser as any)
      .mockResolvedValueOnce(existingUser as any);
    jest.spyOn(prisma.oAuthAccount, 'create').mockResolvedValueOnce({} as any);

    const oauthUser: Record<string, unknown> = {
      email: 'golfer@example.com',
      name: null,
    };

    const result = await signIn!(
      {
        user: oauthUser as any,
        account: {
          provider: 'google',
          providerAccountId: 'google-account-123',
        },
        profile: {
          email: 'golfer@example.com',
          email_verified: true,
        },
      } as any,
    );

    expect(result).toBe(true);
    expect(oauthUser.id).toBe('7');
    expect(oauthUser.email).toBe('golfer@example.com');
    expect(oauthUser.theme).toBe('dark');
  });

  it('blocks brand-new oauth signup when private beta is closed and email is not allowlisted', async () => {
    const signIn = authOptions.callbacks?.signIn;
    expect(signIn).toBeDefined();

    jest.spyOn(prisma.oAuthAccount, 'findUnique').mockResolvedValueOnce(null as any);
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null as any);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null as any);
    jest.spyOn((prisma as any).featureFlag, 'findUnique').mockResolvedValueOnce({ enabled: false });
    jest.spyOn((prisma as any).allowedEmail, 'findUnique').mockResolvedValueOnce(null);

    const result = await signIn!(
      {
        user: {
          email: 'newgolfer@example.com',
          name: null,
        },
        account: {
          provider: 'google',
          providerAccountId: 'google-account-999',
        },
        profile: {
          email: 'newgolfer@example.com',
          email_verified: true,
        },
      } as any,
    );

    expect(result).toBe('/login?error=WaitlistOnly');
  });
});
