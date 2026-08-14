type AuthCookieEnvironment = {
  NEXTAUTH_URL?: string;
  VERCEL?: string;
};

export function buildPkceCodeVerifierCookie(
  env: AuthCookieEnvironment = process.env as AuthCookieEnvironment,
) {
  const secure = env.NEXTAUTH_URL?.startsWith('https://') === true || env.VERCEL === '1';

  return {
    name: `${secure ? '__Secure-' : ''}next-auth.pkce.code_verifier`,
    options: {
      httpOnly: true,
      sameSite: secure ? ('none' as const) : ('lax' as const),
      path: '/',
      secure,
      maxAge: 60 * 15,
    },
  };
}
