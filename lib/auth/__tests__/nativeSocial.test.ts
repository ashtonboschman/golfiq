import { jwtVerify } from 'jose';
import { verifyNativeSocialIdToken } from '@/lib/auth/nativeSocial';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => jest.fn()),
  jwtVerify: jest.fn(),
}));

const mockedJwtVerify = jest.mocked(jwtVerify);

describe('native social ID token verification', () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const originalAppleIOSClientId = process.env.APPLE_IOS_CLIENT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'google-web-client-id';
    process.env.APPLE_IOS_CLIENT_ID = 'ca.golfiq.app';
  });

  afterAll(() => {
    process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    process.env.APPLE_IOS_CLIENT_ID = originalAppleIOSClientId;
  });

  it('verifies Google signature claims against the web client audience', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        sub: 'google-user-1',
        email: 'golfer@example.com',
        email_verified: true,
        given_name: 'Golf',
        family_name: 'Er',
      },
    } as never);

    await expect(verifyNativeSocialIdToken({
      provider: 'google',
      idToken: 'google-token',
    })).resolves.toEqual({
      provider: 'google',
      providerAccountId: 'google-user-1',
      email: 'golfer@example.com',
      emailVerified: true,
      firstName: 'Golf',
      lastName: 'Er',
    });

    expect(mockedJwtVerify).toHaveBeenCalledWith(
      'google-token',
      expect.any(Function),
      expect.objectContaining({ audience: 'google-web-client-id' }),
    );
  });

  it('requires the Apple token nonce to match the native request', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        sub: 'apple-user-1',
        email: 'relay@example.com',
        email_verified: 'true',
        nonce: 'expected-nonce',
      },
    } as never);

    await expect(verifyNativeSocialIdToken({
      provider: 'apple',
      idToken: 'apple-token',
      nonce: 'wrong-nonce',
    })).rejects.toThrow('nonce does not match');
  });

  it('accepts a verified Apple identity for the native bundle audience', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        sub: 'apple-user-1',
        email: 'relay@example.com',
        email_verified: 'true',
        nonce: 'expected-nonce',
      },
    } as never);

    await expect(verifyNativeSocialIdToken({
      provider: 'apple',
      idToken: 'apple-token',
      nonce: 'expected-nonce',
    })).resolves.toEqual(expect.objectContaining({
      provider: 'apple',
      providerAccountId: 'apple-user-1',
      emailVerified: true,
    }));

    expect(mockedJwtVerify).toHaveBeenCalledWith(
      'apple-token',
      expect.any(Function),
      expect.objectContaining({ audience: 'ca.golfiq.app' }),
    );
  });
});
