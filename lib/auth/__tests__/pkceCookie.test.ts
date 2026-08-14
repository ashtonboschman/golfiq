import { buildPkceCodeVerifierCookie } from '@/lib/auth/pkceCookie';

describe('PKCE verifier cookie configuration', () => {
  it("allows Apple's cross-site form POST callback over HTTPS", () => {
    expect(
      buildPkceCodeVerifierCookie({
        NEXTAUTH_URL: 'https://www.golfiq.ca',
      }),
    ).toEqual({
      name: '__Secure-next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        maxAge: 60 * 15,
      },
    });
  });

  it('keeps local HTTP authentication usable', () => {
    expect(
      buildPkceCodeVerifierCookie({
        NEXTAUTH_URL: 'http://localhost:3000',
      }),
    ).toMatchObject({
      name: 'next-auth.pkce.code_verifier',
      options: {
        sameSite: 'lax',
        secure: false,
      },
    });
  });

  it('uses secure cross-site cookies on Vercel when NEXTAUTH_URL is inferred', () => {
    expect(buildPkceCodeVerifierCookie({ VERCEL: '1' })).toMatchObject({
      name: '__Secure-next-auth.pkce.code_verifier',
      options: {
        sameSite: 'none',
        secure: true,
      },
    });
  });
});
