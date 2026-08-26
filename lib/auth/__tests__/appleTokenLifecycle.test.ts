import {
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  exchangeAppleAuthorizationCode,
  revokeAppleRefreshToken,
} from '@/lib/auth/appleTokenLifecycle';
import { getAppleCredentialsForClientId } from '@/lib/auth/appleClientSecret';

jest.mock('@/lib/auth/appleClientSecret', () => ({
  getAppleCredentialsForClientId: jest.fn(),
}));

const mockedCredentials = jest.mocked(getAppleCredentialsForClientId);

describe('Apple token lifecycle', () => {
  const originalSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';
  });

  afterAll(() => {
    process.env.NEXTAUTH_SECRET = originalSecret;
  });

  it('encrypts refresh tokens at rest and decrypts them losslessly', () => {
    const encrypted = encryptAppleRefreshToken('apple-refresh-token');

    expect(encrypted).not.toContain('apple-refresh-token');
    expect(decryptAppleRefreshToken(encrypted)).toBe('apple-refresh-token');
  });

  it('rejects a tampered encrypted credential', () => {
    const encrypted = encryptAppleRefreshToken('apple-refresh-token');
    expect(() => decryptAppleRefreshToken(`${encrypted}tampered`)).toThrow();
  });

  it('exchanges a native authorization code for a refresh token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ refresh_token: 'refresh-token' }),
    }) as jest.Mock;

    await expect(exchangeAppleAuthorizationCode({
      authorizationCode: 'authorization-code',
      clientId: 'ca.golfiq.app',
      clientSecret: 'client-secret',
    })).resolves.toBe('refresh-token');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain('grant_type=authorization_code');
  });

  it('revokes the decrypted refresh token with its original client ID', async () => {
    mockedCredentials.mockReturnValue({
      clientId: 'ca.golfiq.app',
      clientSecret: 'client-secret',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as jest.Mock;

    await revokeAppleRefreshToken({
      encryptedRefreshToken: encryptAppleRefreshToken('refresh-token'),
      clientId: 'ca.golfiq.app',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    expect(body).toContain('token=refresh-token');
    expect(body).toContain('token_type_hint=refresh_token');
  });
});
