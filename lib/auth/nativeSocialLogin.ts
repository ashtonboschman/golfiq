'use client';

import { AppleSignIn, SignInScope } from '@capawesome/capacitor-apple-sign-in';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { isNativeIOS } from '@/lib/platform';
import type { NativeSocialProvider } from '@/lib/auth/nativeSocial';

export type NativeSocialLoginResult = {
  idToken: string;
  authorizationCode: string | null;
  nonce: string | null;
  firstName: string | null;
  lastName: string | null;
};

let initializedGoogleClientId: string | null = null;

const NATIVE_SIGN_IN_CANCELED_CODE = 'SIGN_IN_CANCELED';

export function isNativeSocialLoginCanceled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === NATIVE_SIGN_IN_CANCELED_CODE;
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function getGoogleWebClientId(): Promise<string> {
  const response = await fetch('/api/auth/native-social/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Google sign-in configuration is unavailable.');

  const data = await response.json() as { googleClientId?: unknown };
  if (typeof data.googleClientId !== 'string' || !data.googleClientId) {
    throw new Error('Google sign-in configuration is unavailable.');
  }
  return data.googleClientId;
}

export async function startNativeSocialLogin(
  provider: NativeSocialProvider,
): Promise<NativeSocialLoginResult> {
  if (!isNativeIOS()) throw new Error('Native social sign-in is only available in the iOS app.');

  if (provider === 'google') {
    const clientId = await getGoogleWebClientId();
    if (initializedGoogleClientId !== clientId) {
      await GoogleSignIn.initialize({ clientId });
      initializedGoogleClientId = clientId;
    }

    const result = await GoogleSignIn.signIn();
    return {
      idToken: result.idToken,
      authorizationCode: null,
      nonce: null,
      firstName: result.givenName,
      lastName: result.familyName,
    };
  }

  const nonce = createNonce();
  const result = await AppleSignIn.signIn({
    nonce,
    scopes: [SignInScope.Email, SignInScope.FullName],
  });
  return {
    idToken: result.idToken,
    authorizationCode: result.authorizationCode,
    nonce,
    firstName: result.givenName,
    lastName: result.familyName,
  };
}
