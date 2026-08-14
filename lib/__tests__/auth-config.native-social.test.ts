import { authOptions } from '@/lib/auth-config';
import { verifyNativeSocialIdToken } from '@/lib/auth/nativeSocial';
import { prisma } from '@/lib/db';

jest.mock('@/lib/auth/nativeSocial', () => ({
  verifyNativeSocialIdToken: jest.fn(),
}));

const mockedVerifyNativeSocialIdToken = jest.mocked(verifyNativeSocialIdToken);

describe('native social NextAuth provider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies a native token and creates the normal GolfIQ auth user', async () => {
    const existingUser = {
      id: BigInt(7),
      email: 'golfer@example.com',
      username: 'golfer',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      profile: {
        avatarUrl: '/avatars/default.png',
        firstName: 'Golf',
        lastName: 'Er',
        theme: 'dark',
        timezone: null,
      },
    };
    mockedVerifyNativeSocialIdToken.mockResolvedValue({
      provider: 'google',
      providerAccountId: 'google-user-7',
      email: 'golfer@example.com',
      emailVerified: true,
      firstName: 'Golf',
      lastName: 'Er',
    });
    jest.spyOn(prisma.oAuthAccount, 'findUnique').mockResolvedValueOnce({
      user: existingUser,
    } as never);

    const configuredProvider = authOptions.providers.find(
      (entry) => (entry as any).options?.id === 'native-social',
    ) as any;
    const provider = { ...configuredProvider, ...configuredProvider.options };
    const user = await provider.authorize({
      provider: 'google',
      idToken: 'signed-google-token',
      nonce: '',
      firstName: 'Ignored',
      lastName: 'Name',
    }, {});

    expect(mockedVerifyNativeSocialIdToken).toHaveBeenCalledWith({
      provider: 'google',
      idToken: 'signed-google-token',
      nonce: '',
    });
    expect(user).toEqual(expect.objectContaining({
      id: '7',
      email: 'golfer@example.com',
      auth_provider: 'google',
    }));
  });

  it('preserves the native provider name in the JWT session token', async () => {
    const jwt = authOptions.callbacks?.jwt;
    const token = await jwt!({
      token: {},
      user: {
        id: '7',
        email: 'golfer@example.com',
        name: 'golfer',
        auth_provider: 'apple',
      },
      account: { provider: 'native-social' },
    } as any);

    expect(token.auth_provider).toBe('apple');
  });
});
