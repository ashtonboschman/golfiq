import { createRemoteJWKSet, jwtVerify } from 'jose';

export type NativeSocialProvider = 'google' | 'apple';

export type VerifiedNativeSocialIdentity = {
  provider: NativeSocialProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
};

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function claimAsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length ? value.trim() : null;
}

function claimAsBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function verifyNativeSocialIdToken(args: {
  provider: NativeSocialProvider;
  idToken: string;
  nonce?: string | null;
}): Promise<VerifiedNativeSocialIdentity> {
  if (args.provider === 'google') {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) throw new Error('Google native sign-in is not configured.');

    const { payload } = await jwtVerify(args.idToken, googleKeys, {
      audience,
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
    });

    const providerAccountId = claimAsString(payload.sub);
    if (!providerAccountId) throw new Error('Google ID token is missing a subject.');

    return {
      provider: 'google',
      providerAccountId,
      email: claimAsString(payload.email),
      emailVerified: claimAsBoolean(payload.email_verified),
      firstName: claimAsString(payload.given_name),
      lastName: claimAsString(payload.family_name),
    };
  }

  const audience = process.env.APPLE_IOS_CLIENT_ID || 'ca.golfiq.app';
  const { payload } = await jwtVerify(args.idToken, appleKeys, {
    audience,
    issuer: 'https://appleid.apple.com',
  });

  const providerAccountId = claimAsString(payload.sub);
  if (!providerAccountId) throw new Error('Apple ID token is missing a subject.');
  if (!args.nonce || payload.nonce !== args.nonce) {
    throw new Error('Apple ID token nonce does not match.');
  }

  return {
    provider: 'apple',
    providerAccountId,
    email: claimAsString(payload.email),
    emailVerified: claimAsBoolean(payload.email_verified),
    firstName: null,
    lastName: null,
  };
}
