/** @jest-environment jsdom */

import { AppleSignIn, SignInScope } from '@capawesome/capacitor-apple-sign-in';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { startNativeSocialLogin } from '@/lib/auth/nativeSocialLogin';
import { isNativeIOS } from '@/lib/platform';

jest.mock('@capawesome/capacitor-apple-sign-in', () => ({
  AppleSignIn: { signIn: jest.fn() },
  SignInScope: { Email: 'EMAIL', FullName: 'FULL_NAME' },
}));

jest.mock('@capawesome/capacitor-google-sign-in', () => ({
  GoogleSignIn: { initialize: jest.fn(), signIn: jest.fn() },
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

const mockedAppleSignIn = jest.mocked(AppleSignIn.signIn);
const mockedGoogleInitialize = jest.mocked(GoogleSignIn.initialize);
const mockedGoogleSignIn = jest.mocked(GoogleSignIn.signIn);
const mockedIsNativeIOS = jest.mocked(isNativeIOS);

describe('native social login bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeIOS.mockReturnValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ googleClientId: 'google-web-client-id' }),
    }) as jest.Mock;
  });

  it('uses the native Google SDK and returns its ID token', async () => {
    mockedGoogleInitialize.mockResolvedValue();
    mockedGoogleSignIn.mockResolvedValue({
      idToken: 'google-id-token',
      userId: 'google-user',
      email: 'golfer@example.com',
      displayName: 'Golf Er',
      givenName: 'Golf',
      familyName: 'Er',
      imageUrl: null,
      accessToken: null,
      serverAuthCode: null,
    });

    await expect(startNativeSocialLogin('google')).resolves.toEqual({
      idToken: 'google-id-token',
      authorizationCode: null,
      nonce: null,
      firstName: 'Golf',
      lastName: 'Er',
    });
    expect(mockedGoogleInitialize).toHaveBeenCalledWith({ clientId: 'google-web-client-id' });
  });

  it('uses Apple requested scopes and forwards the nonce with its ID token', async () => {
    mockedAppleSignIn.mockResolvedValue({
      authorizationCode: 'apple-code',
      idToken: 'apple-id-token',
      user: 'apple-user',
      email: 'relay@example.com',
      givenName: 'Golf',
      familyName: 'Er',
    });

    const result = await startNativeSocialLogin('apple');

    expect(result.idToken).toBe('apple-id-token');
    expect(result.authorizationCode).toBe('apple-code');
    expect(result.nonce).toEqual(expect.any(String));
    expect(mockedAppleSignIn).toHaveBeenCalledWith({
      nonce: result.nonce,
      scopes: [SignInScope.Email, SignInScope.FullName],
    });
  });
});
