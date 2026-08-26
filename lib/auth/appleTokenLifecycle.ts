import crypto from 'crypto';
import { getAppleCredentialsForClientId } from '@/lib/auth/appleClientSecret';

const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_ENDPOINT = 'https://appleid.apple.com/auth/revoke';
const ENCRYPTION_VERSION = 'v1';

function encryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error('NEXTAUTH_SECRET is required to protect Apple credentials.');
  return crypto.createHash('sha256').update(`golfiq:apple-oauth:${secret}`).digest();
}

export function encryptAppleRefreshToken(refreshToken: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptAppleRefreshToken(encrypted: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split('.');
  if (version !== ENCRYPTION_VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error('Invalid encrypted Apple credential.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function postToApple(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Apple token request failed (${response.status}).`);
  }
  return payload;
}

export async function exchangeAppleAuthorizationCode(args: {
  authorizationCode: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const payload = await postToApple(APPLE_TOKEN_ENDPOINT, new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.authorizationCode,
    grant_type: 'authorization_code',
  }));
  if (typeof payload.refresh_token !== 'string' || !payload.refresh_token) {
    throw new Error('Apple did not return a refresh token.');
  }
  return payload.refresh_token;
}

export async function revokeAppleRefreshToken(args: {
  encryptedRefreshToken: string;
  clientId: string;
}): Promise<void> {
  const credentials = getAppleCredentialsForClientId(args.clientId);
  if (!credentials) throw new Error('Apple token revocation is not configured.');

  await postToApple(APPLE_REVOKE_ENDPOINT, new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    token: decryptAppleRefreshToken(args.encryptedRefreshToken),
    token_type_hint: 'refresh_token',
  }));
}
