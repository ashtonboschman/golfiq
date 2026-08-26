import { authOptions } from '@/lib/auth-config';
import { verifyNativeSocialIdToken } from '@/lib/auth/nativeSocial';
import { prisma } from '@/lib/db';
import { getAppleNativeProviderCredentials } from '@/lib/auth/appleClientSecret';
import { exchangeAppleAuthorizationCode } from '@/lib/auth/appleTokenLifecycle';

jest.mock('@/lib/auth/nativeSocial', () => ({
  verifyNativeSocialIdToken: jest.fn(),
}));

jest.mock('@/lib/auth/appleClientSecret', () => ({
  getAppleProviderCredentials: jest.fn(() => null),
  getAppleNativeProviderCredentials: jest.fn(),
}));

jest.mock('@/lib/auth/appleTokenLifecycle', () => ({
  encryptAppleRefreshToken: jest.fn(() => 'encrypted-refresh-token'),
  exchangeAppleAuthorizationCode: jest.fn(),
}));

const mockedVerifyNativeSocialIdToken = jest.mocked(verifyNativeSocialIdToken);
const mockedAppleCredentials = jest.mocked(getAppleNativeProviderCredentials);
const mockedExchangeAppleAuthorizationCode = jest.mocked(exchangeAppleAuthorizationCode);

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

  it('exchanges and stores the Apple revocation credential during native sign-in', async () => {
    const existingUser = {
      id: BigInt(8),
      email: 'apple@example.com',
      username: 'applegolfer',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      profile: {
        avatarUrl: '/avatars/default.png',
        firstName: 'Apple',
        lastName: 'Golfer',
        theme: 'dark',
        timezone: null,
      },
    };
    mockedVerifyNativeSocialIdToken.mockResolvedValue({
      provider: 'apple',
      providerAccountId: 'apple-user-8',
      email: 'apple@example.com',
      emailVerified: true,
      firstName: 'Apple',
      lastName: 'Golfer',
    });
    mockedAppleCredentials.mockReturnValue({
      clientId: 'ca.golfiq.app',
      clientSecret: 'client-secret',
    });
    mockedExchangeAppleAuthorizationCode.mockResolvedValue('refresh-token');
    jest.spyOn(prisma.oAuthAccount, 'findUnique').mockResolvedValueOnce({
      user: existingUser,
    } as never);
    const updateSpy = jest.spyOn(prisma.oAuthAccount, 'update').mockResolvedValue({} as never);

    const configuredProvider = authOptions.providers.find(
      (entry) => (entry as any).options?.id === 'native-social',
    ) as any;
    const provider = { ...configuredProvider, ...configuredProvider.options };
    const user = await provider.authorize({
      provider: 'apple',
      idToken: 'signed-apple-token',
      authorizationCode: 'one-time-code',
      nonce: 'nonce',
      firstName: 'Apple',
      lastName: 'Golfer',
    }, {});

    expect(user).toEqual(expect.objectContaining({ id: '8', auth_provider: 'apple' }));
    expect(mockedExchangeAppleAuthorizationCode).toHaveBeenCalledWith({
      authorizationCode: 'one-time-code',
      clientId: 'ca.golfiq.app',
      clientSecret: 'client-secret',
    });
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        refreshTokenEncrypted: 'encrypted-refresh-token',
        refreshTokenClientId: 'ca.golfiq.app',
      },
    }));
  });
});
