import {
  getAppleNativeProviderCredentials,
  getAppleProviderCredentials,
  type AppleProviderCredentials,
} from '@/lib/auth/appleClientSecret';

export type AuthProviderEnvironment = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED?: string;
  NEXT_PUBLIC_AUTH_APPLE_ENABLED?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_IOS_CLIENT_ID?: string;
  APPLE_IOS_CLIENT_SECRET?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_PRIVATE_KEY_BASE64?: string;
};

type GoogleProviderCredentials = {
  clientId: string;
  clientSecret: string;
};

export type AuthProviderConfiguration = {
  web: {
    google: GoogleProviderCredentials | null;
    apple: AppleProviderCredentials | null;
  };
  native: {
    google: { clientId: string } | null;
    apple: AppleProviderCredentials | null;
  };
  issues: string[];
};

function optionalValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getAuthProviderConfiguration(
  env: AuthProviderEnvironment = process.env as AuthProviderEnvironment,
): AuthProviderConfiguration {
  const googleClientId = optionalValue(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = optionalValue(env.GOOGLE_CLIENT_SECRET);
  const googleWebCredentials = googleClientId && googleClientSecret
    ? { clientId: googleClientId, clientSecret: googleClientSecret }
    : null;
  const googleNativeCredentials = googleClientId ? { clientId: googleClientId } : null;
  const appleWebCredentials = getAppleProviderCredentials(env);
  const appleNativeCredentials = getAppleNativeProviderCredentials(env);
  const issues: string[] = [];

  if ((googleClientId || googleClientSecret) && !googleWebCredentials) {
    issues.push('Google web sign-in requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  if (env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === '1' && !googleWebCredentials) {
    issues.push('Google web sign-in was publicly enabled without complete server credentials.');
  }
  if (env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === '1' && !appleWebCredentials) {
    issues.push('Apple web sign-in was publicly enabled without complete server credentials.');
  }
  if (optionalValue(env.APPLE_CLIENT_ID) && !appleWebCredentials) {
    issues.push('Apple web sign-in has a client ID but no usable client secret configuration.');
  }
  if (
    (optionalValue(env.APPLE_IOS_CLIENT_ID) || optionalValue(env.APPLE_IOS_CLIENT_SECRET))
    && !appleNativeCredentials
  ) {
    issues.push('Apple native sign-in is configured incompletely.');
  }

  return {
    web: {
      google: googleWebCredentials,
      apple: appleWebCredentials,
    },
    native: {
      google: googleNativeCredentials,
      apple: appleNativeCredentials,
    },
    issues,
  };
}

export function getPublicAuthProviderAvailability(configuration: AuthProviderConfiguration) {
  return {
    web: {
      google: Boolean(configuration.web.google),
      apple: Boolean(configuration.web.apple),
    },
    native: {
      google: Boolean(configuration.native.google),
      apple: Boolean(configuration.native.apple),
    },
  };
}
