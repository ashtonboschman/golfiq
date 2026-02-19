import { authOptions } from '@/lib/auth-config';

describe('authOptions callbacks', () => {
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
});
