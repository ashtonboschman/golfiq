import jwt from 'jsonwebtoken';

type AppleAuthEnvironment = {
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_IOS_CLIENT_ID?: string;
  APPLE_IOS_CLIENT_SECRET?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_PRIVATE_KEY_BASE64?: string;
};

export type AppleProviderCredentials = {
  clientId: string;
  clientSecret: string;
};

const APPLE_TOKEN_AUDIENCE = 'https://appleid.apple.com';
const APPLE_CLIENT_SECRET_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

function optionalValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readPrivateKey(env: AppleAuthEnvironment): string | null {
  const base64Key = optionalValue(env.APPLE_PRIVATE_KEY_BASE64);
  if (base64Key) {
    return Buffer.from(base64Key, 'base64').toString('utf8').trim();
  }

  const rawKey = optionalValue(env.APPLE_PRIVATE_KEY);
  return rawKey?.replace(/\\n/g, '\n') ?? null;
}

export function createAppleClientSecret(args: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}): string {
  return jwt.sign({}, args.privateKey, {
    algorithm: 'ES256',
    audience: APPLE_TOKEN_AUDIENCE,
    expiresIn: APPLE_CLIENT_SECRET_LIFETIME_SECONDS,
    issuer: args.teamId,
    keyid: args.keyId,
    subject: args.clientId,
  });
}

export function getAppleProviderCredentials(
  env: AppleAuthEnvironment = process.env as AppleAuthEnvironment,
): AppleProviderCredentials | null {
  const clientId = optionalValue(env.APPLE_CLIENT_ID);
  if (!clientId) return null;

  const configuredClientSecret = optionalValue(env.APPLE_CLIENT_SECRET);
  if (configuredClientSecret) {
    return { clientId, clientSecret: configuredClientSecret };
  }

  const teamId = optionalValue(env.APPLE_TEAM_ID);
  const keyId = optionalValue(env.APPLE_KEY_ID);
  const privateKey = readPrivateKey(env);
  if (!teamId || !keyId || !privateKey) return null;

  return {
    clientId,
    clientSecret: createAppleClientSecret({ clientId, teamId, keyId, privateKey }),
  };
}

export function getAppleCredentialsForClientId(
  clientId: string,
  env: AppleAuthEnvironment = process.env as AppleAuthEnvironment,
): AppleProviderCredentials | null {
  const normalizedClientId = optionalValue(clientId);
  if (!normalizedClientId) return null;

  const webClientId = optionalValue(env.APPLE_CLIENT_ID);
  const iosClientId = optionalValue(env.APPLE_IOS_CLIENT_ID) ?? 'ca.golfiq.app';
  const configuredClientSecret = normalizedClientId === webClientId
    ? optionalValue(env.APPLE_CLIENT_SECRET)
    : normalizedClientId === iosClientId
      ? optionalValue(env.APPLE_IOS_CLIENT_SECRET)
      : null;
  if (configuredClientSecret) {
    return { clientId: normalizedClientId, clientSecret: configuredClientSecret };
  }

  const teamId = optionalValue(env.APPLE_TEAM_ID);
  const keyId = optionalValue(env.APPLE_KEY_ID);
  const privateKey = readPrivateKey(env);
  if (!teamId || !keyId || !privateKey) return null;

  return {
    clientId: normalizedClientId,
    clientSecret: createAppleClientSecret({
      clientId: normalizedClientId,
      teamId,
      keyId,
      privateKey,
    }),
  };
}

export function getAppleNativeProviderCredentials(
  env: AppleAuthEnvironment = process.env as AppleAuthEnvironment,
): AppleProviderCredentials | null {
  return getAppleCredentialsForClientId(
    optionalValue(env.APPLE_IOS_CLIENT_ID) ?? 'ca.golfiq.app',
    env,
  );
}
